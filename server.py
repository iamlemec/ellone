import os
import shutil
import sys
import re
import json
import socket
import argparse
import mimetypes
from operator import itemgetter
from collections import namedtuple, defaultdict
import codecs
import random
from subprocess import call
from threading import Lock
import webbrowser
import operator

import tornado.ioloop
import tornado.web
import tornado.websocket

# source directory
elldir = os.path.dirname(os.path.realpath(__file__))
template_dir = os.path.join(elldir, 'templates')
static_dir = os.path.join(elldir, 'static')

# get free port
def get_open_port():
    s = socket.socket()
    s.bind(('', 0))
    port = s.getsockname()[1]
    s.close()
    return port

# parse input arguments
ap = argparse.ArgumentParser(description='Elltwo Server.')
ap.add_argument('--path', type=str, default='.', help='path for markdown files')
ap.add_argument('--port', type=int, default=0, help='port to serve on')
ap.add_argument('--ip', type=str, default='127.0.0.1', help='ip address to listen on')
ap.add_argument('--demo', type=str, default=None, help='run in demo mode with these docs')
ap.add_argument('--auth', type=str, default=None, help='login information')
ap.add_argument('--macros', type=str, default=None, help='katex macros file')
ap.add_argument('--local-libs', action='store_true', help='use local libraries instead of CDN')
ap.add_argument('--browser', action='store_true', help='open browser to portal')
args = ap.parse_args()

# others
is_demo = args.demo is not None
use_auth = (args.demo is None) and (args.auth is not None)
port = args.port if args.port != 0 else get_open_port()
local_libs = args.local_libs
tmp_dir = '/tmp'
blank_doc = '#! Title\n\nBody text.'

# macros
if args.macros is None:
    macros = "{}"
else:
    macros = open(args.macros).read().replace('\\', '\\\\')

# base directory
basedir = os.path.abspath(args.path)
if os.path.isdir(basedir):
    basefile = None
else:
    (basedir, basefile) = os.path.split(basedir)

# print state
print('serving %s on http://%s:%s' % (basedir, args.ip, port))

# randomization
rand_hex = lambda: hex(random.getrandbits(128))[2:].zfill(32)

# cell locking mechanisms (per file)
locks = defaultdict(Lock)

# authentication
if use_auth:
    with open(args.auth) as fid:
      auth = json.load(fid)
    cookie_secret = auth['cookie_secret']
    username_true = auth['username']
    password_true = auth['password']
else:
    cookie_secret = None

if use_auth:
    def authenticated(get0):
        def get1(self, *args):
            current_user = self.get_secure_cookie('user')
            if not current_user:
                self.redirect('/__auth/login/')
                return
            get0(self, *args)
        return get1
else:
    def authenticated(get0):
        return get0

# initialize/open database
def read_cells(fname):
    try:
        fid = open(fname, 'r+', encoding='utf-8')
        text = fid.read()
        fid.close()
    except:
        text = 'Error reading file!'

    # construct cell dictionary
    tcells = map(str.strip, text.split('\n\n'))
    fcells = list(filter(len, tcells))
    if len(fcells) > 0:
        cells = {i: {'prev': i-1, 'next': i+1, 'body': s} for (i, s) in enumerate(fcells)}
        cells[max(cells.keys())]['next'] = -1
        cells[min(cells.keys())]['prev'] = -1
    else:
        cells = {0: {'prev': -1, 'next': 1, 'body': '#! Title'}, 1: {'prev':0, 'next': -1, 'body': 'Body text.'}}
    return cells

def gen_cells(cells):
    cur = [c for c in cells.values() if c['prev'] == -1]
    if len(cur) > 0:
        cur = cur[0]
    else:
        return
    while cur is not None:
        yield cur
        nextid = cur['next']
        cur = cells[nextid] if nextid != -1 else None

def construct_markdown(cells):
    return '\n\n'.join(map(itemgetter('body'), gen_cells(cells)))

def get_base_name(fname):
    ret = re.match(r'(.*)\.md', fname)
    if ret:
        fname_new = ret.group(1)
    else:
        fname_new = fname
    return fname_new

def validate_path(relpath, base, weak=False):
    absbase = os.path.abspath(base)
    abspath = os.path.abspath(os.path.join(absbase, relpath))
    prefix = os.path.normpath(os.path.commonprefix([abspath, absbase]))
    op = operator.ge if weak else operator.gt
    valid = (prefix == absbase) and op(len(abspath), len(absbase))
    return abspath if valid else None

# Tornado time
class AuthLoginHandler(tornado.web.RequestHandler):
    def get(self):
        try:
            errormessage = self.get_argument('error')
        except:
            errormessage = ''
        self.render('login.html', errormessage=errormessage)

    def check_permission(self, password, username):
        if username == username_true and password == password_true:
            return True
        return False

    def post(self):
        username = self.get_argument('username', '')
        password = self.get_argument('password', '')
        auth = self.check_permission(password, username)
        if auth:
            self.set_current_user(username)
            self.redirect('/')
        else:
            error_msg = '?error=' + tornado.escape.url_escape('Login incorrect')
            self.redirect('/__auth/login/' + error_msg)

    def set_current_user(self, user):
        if user:
            self.set_secure_cookie('user', tornado.escape.json_encode(user))
        else:
            self.clear_cookie('user')

class AuthLogoutHandler(tornado.web.RequestHandler):
    def get(self):
        self.clear_cookie('user')
        self.redirect(self.get_argument('next', '/'))

class BrowseHandler(tornado.web.RequestHandler):
    @authenticated
    def get(self):
        self.render('directory.html', relpath='', dirname='', pardir='', demo=is_demo)

class PathHandler(tornado.web.RequestHandler):
    @authenticated
    def get(self, path):
        (pardir, fname) = os.path.split(path)
        fpath = validate_path(path, basedir)
        if fpath is None:
            print('Path out of bounds!')
            return
        if os.path.isdir(fpath):
            self.render('directory.html', relpath=path, dirname=fname, pardir=pardir, demo=is_demo)
        elif os.path.isfile(fpath):
            (_, ext) = os.path.splitext(fname)
            if ext in ('.md', '.rst', ''):
                self.render('editor.html', path=path, fname=fname, macros=macros, local_libs=local_libs)
            else:
                (mime_type, encoding) = mimetypes.guess_type(path)
                if mime_type:
                    self.set_header("Content-Type", mime_type)
                fid = open(fpath, 'rb')
                self.write(fid.read())
        else:
            self.write('File %s not found!' % path)

class UploadHandler(tornado.web.RequestHandler):
    @authenticated
    def post(self, rpath):
        finfo = self.request.files['payload'][0]
        fname = finfo['filename']
        rname = os.path.join(rpath, fname)
        plocal = validate_path(rname, basedir)
        if plocal is None:
            print('Path out of bounds!')
            return
        if os.path.isdir(plocal):
            print('Directory exists!')
            return
        with open(plocal, 'wb') as out:
            out.write(finfo['body'])

class DemoHandler(tornado.web.RequestHandler):
    def get(self):
        drand = rand_hex()
        fullpath = os.path.join(basedir, drand)
        shutil.copytree(args.demo, fullpath)
        self.redirect('/%s' % drand)

class ExportHandler(tornado.web.RequestHandler):
    @authenticated
    def post(self, rpath):
        fullpath = validate_path(rpath, tmp_dir)
        if fullpath is None:
            print('Path out of bounds!')
            return
        (curdir, fname) = os.path.split(fullpath)

        # determine content type
        (base_name, ext) = os.path.splitext(fname)
        ext = ext[1:]
        if ext == 'md':
            fmode = 'r'
            ctype = 'text/markdown'
        elif ext == 'html':
            fmode = 'r'
            ctype = 'text/html'
        elif ext == 'tex':
            fmode = 'r'
            ctype = 'text/latex'
        elif ext == 'pdf':
            fmode = 'rb'
            ctype = 'application/pdf'

        # read source
        fid = open(fullpath, fmode)
        text = fid.read()

        # post output
        self.set_header('Content-Type', ctype)
        self.set_header('Content-Disposition', 'attachment; filename=%s' % fname)
        self.write(text)
    get = post

class ContentHandler(tornado.websocket.WebSocketHandler):
    def initialize(self):
        print('initializing')
        self.cells = {}
        self.live = False

    def allow_draft76(self):
        return True

    def open(self, path):
        print('connection received: %s' % path)
        self.fullpath = validate_path(path, basedir)
        if self.fullpath is None:
            print('Path out of bounds!')
            self.close()
            return
        if locks[self.fullpath].acquire(blocking=False):
            self.live = True
        self.path = path
        (self.fulldir, self.fname) = os.path.split(self.fullpath)
        self.basename = get_base_name(self.fname)
        self.temppath = os.path.join(tmp_dir, self.fname)
        self.cells = read_cells(self.fullpath)

    def on_close(self):
        print('connection closing')
        if self.live:
            locks[self.fullpath].release()

    def error_msg(self, error_code):
        if not error_code is None:
            json_string = json.dumps({'type': 'error', 'code': error_code})
            self.write_message(json_string)
        else:
            print('error code not found')

    def on_message(self, msg):
        print('received message: %s' % msg)

        data = json.loads(msg)
        (cmd, cont) = (data['cmd'], data['content'])

        if not self.live:
            print('%s Locked' % self.path)
            if cmd not in ['fetch', 'export']:
                return

        if cmd == 'fetch':
            rcmd = 'fetch' if self.live else 'readonly'
            self.cells = read_cells(self.fullpath)
            vcells = [dict(c, cid=i) for (i, c) in self.cells.items()]
            print(vcells)
            self.write_message(json.dumps({'cmd': rcmd, 'content': vcells}))
        elif cmd == 'revert':
            self.cells = read_cells(self.fullpath)
            vcells = [dict(c, cid=i) for (i, c) in self.cells.items()]
            self.write_message(json.dumps({'cmd': 'fetch', 'content': vcells}))
        elif cmd == 'save':
            cid = int(cont['cid'])
            body = cont['body']
            self.cells[cid]['body'] = body
        elif cmd == 'create':
            newid = int(cont['newid'])
            prev = int(cont['prev'])
            succ = int(cont['next'])
            if prev is not -1:
                self.cells[prev]['next'] = newid
            if succ is not -1:
                self.cells[succ]['prev'] = newid
            self.cells[newid] = {'prev': prev, 'next': succ, 'body': ''}
        elif cmd == 'delete':
            cid = int(cont['cid'])
            prev = int(cont['prev'])
            succ = int(cont['next'])
            if prev is not -1:
                self.cells[prev]['next'] = succ
            if succ is not -1:
                self.cells[succ]['prev'] = prev
            del self.cells[cid]
        elif cmd == 'write':
            output = construct_markdown(self.cells)
            fid = codecs.open(self.temppath, 'w+', encoding='utf-8')
            fid.write(output)
            fid.close()
            shutil.move(self.temppath, self.fullpath)
        elif cmd == 'export':
            fmt = cont['format']
            data = cont['data']
            deps = cont.get('deps', [])

            # create unique directory
            uuid = rand_hex()
            exp_dir = os.path.join(tmp_dir, uuid)
            os.mkdir(exp_dir)

            # format specific
            (name_base, name_ext) = os.path.splitext(self.fname)
            if fmt == 'md':
                name_new = '%s.md' % name_base
            elif fmt == 'html' or fmt == 'mdplus':
                name_new = '%s.html' % name_base
            elif fmt == 'latex' or fmt == 'pdf':
                name_new = '%s.tex' % name_base

            # save file
            fid = codecs.open(os.path.join(exp_dir, name_new), 'w+', encoding='utf-8')
            fid.write(data)
            fid.close()

            # compilation for pdf
            if fmt == 'pdf':
                for fp in deps:
                    if re.search(fp, r'(^|:)//') is None:
                        if fp.startswith('/'):
                            fp = os.path.join(basedir, fp);
                        else:
                            fp = os.path.join(self.fulldir, fp)
                        fpv = validate_path(fp, basedir)
                        if fpv is not None:
                            try:
                                shutil.copy(fpv, exp_dir)
                            except FileNotFoundError:
                                print('%s: File not found!' % fpv)
                        else:
                            print('%s: Path out of bounds!' % fp)
                            continue
                cwd = os.getcwd()
                os.chdir(exp_dir)
                call(['pdflatex', '-interaction=nonstopmode', name_new])
                call(['pdflatex', '-interaction=nonstopmode', name_new]) # to resolve references
                os.chdir(cwd)
                name_new = '%s.pdf' % name_base

            # reply with location
            self.write_message(json.dumps({'cmd': 'serve', 'content': os.path.join(uuid, name_new)}))
        elif cmd == 'card':
            link = cont['link']
            if link.startswith('/'):
                cpath = validate_path(link.lstrip('/'), basedir)
            else:
                cpath = validate_path(link, self.fulldir)
            if os.path.isfile(cpath):
                with open(cpath) as fid:
                    fline = fid.readline()
                ret = re.match(r'#! *(.*)', fline)
                if ret is not None:
                    title, = ret.groups()
                else:
                    title = '???'
            else:
                title = ''
            self.write_message(json.dumps({
                'cmd': 'card',
                'content': {'link': link, 'title': title}
            }))

class FileHandler(tornado.websocket.WebSocketHandler):
    def initialize(self):
        print('initializing')
        self.live = False

    def allow_draft76(self):
        return True

    def open(self, relpath):
        print('connection received')
        self.relpath = relpath
        self.curdir = validate_path(self.relpath, basedir, weak=True)
        if self.curdir is None:
            print('Path out of bounds!')
            self.close()
            return
        if locks[self.curdir].acquire(blocking=False):
            self.live = True
        (self.pardir, self.dirname) = os.path.split(self.curdir)

    def on_close(self):
        print('connection closing')
        if self.live:
            locks[self.curdir].release()

    def error_msg(self, error_code):
        if not error_code is None:
            json_string = json.dumps({'type': 'error', 'code': error_code})
            self.write_message(json_string)
        else:
            print('error code not found')

    def on_message(self, msg):
        print('received message: %s' % msg)

        data = json.loads(msg)
        (cmd, cont) = (data['cmd'], data['content'])

        if not self.live:
            print('%s Locked' % self.relpath)
            if cmd not in ['list']:
                return

        if cmd == 'list':
            if args.demo and self.relpath == '':
                print('Not so fast!')
                return
        elif cmd == 'create':
            fullpath = validate_path(cont, self.curdir)
            if fullpath is None:
                print('Path out of bounds!')
                return

            if os.path.exists(fullpath):
                print('File exists.')
                return

            try:
                if cont.endswith('/'):
                    os.mkdir(fullpath)
                else:
                    fid = open(fullpath, 'w+')
                    fid.write(blank_doc)
                    fid.close()
            except:
                print('Could not create file \'%s\'' % fullpath)
        elif cmd == 'delete':
            fullpath = validate_path(cont, self.curdir)
            if fullpath is None:
                print('Path out of bounds!')
                return

            if os.path.isdir(fullpath):
                shutil.rmtree(fullpath)
            else:
                os.remove(fullpath)

        # list always
        files = sorted(os.listdir(self.curdir))
        dtype = [os.path.isdir(os.path.join(self.curdir, f)) for f in files]
        dirs = [f for (f, t) in zip(files, dtype) if t]
        docs = [f for (f, t) in zip(files, dtype) if not t and f.endswith('.md')]
        misc = [f for (f, t) in zip(files, dtype) if not t and not f.endswith('.md')]
        cont = {'dirs': dirs, 'docs': docs, 'misc': misc}
        self.write_message(json.dumps({'cmd': 'results', 'content': cont, 'readonly': not self.live}))

# tornado content handlers
class Application(tornado.web.Application):
    def __init__(self):
        handlers = [
            (r'/__auth/login/?', AuthLoginHandler),
            (r'/__auth/logout/?', AuthLogoutHandler),
            (r'/__upload/(.*)', UploadHandler),
            (r'/__export/(.*)', ExportHandler),
            (r'/__elledit/(.*)', ContentHandler),
            (r'/__diredit/(.*)', FileHandler)
        ]

        if args.demo:
            handlers += [
                (r'/?', DemoHandler),
                (r'/(.+)', PathHandler),
            ]
        else:
            handlers += [
                (r'/?', BrowseHandler),
                (r'/(.+?)/?', PathHandler)
            ]

        settings = dict(
            app_name='Elltwo Editor',
            template_path=template_dir,
            static_path=static_dir,
            cookie_secret=cookie_secret
        )

        tornado.web.Application.__init__(self, handlers, debug=True, **settings)

if args.browser:
    webbrowser.open('http://%s:%s/%s' % (args.ip, port, basefile or ''))

# create server
application = Application()
application.listen(port, address=args.ip)
tornado.ioloop.IOLoop.current().start()
