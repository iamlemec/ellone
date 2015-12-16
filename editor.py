import os
import shutil
import sys
import re
import json
import argparse
import traceback
from operator import itemgetter
from collections import namedtuple
from itertools import compress
import codecs
import random

import tornado.ioloop
import tornado.web
import tornado.websocket

# parse input arguments
parser = argparse.ArgumentParser(description='Elltwo Server.')
parser.add_argument('--path', type=str, default='testing', help='path for markdown files')
parser.add_argument('--port', type=int, default=8500, help='port to serve on')
parser.add_argument('--demo', action='store_true', help='run in demo mode')
args = parser.parse_args()

# authentication
with open('auth.txt') as fid:
  auth = json.load(fid)
cookie_secret = auth['cookie_secret']
username_true = auth['username']
password_true = auth['password']

if args.demo:
  def authenticated(get0):
    return get0
else:
  def authenticated(get0):
    def get1(self,*args):
      current_user = self.get_secure_cookie("user")
      print(current_user)
      if not current_user:
        self.redirect("/auth/login/")
        return
      get0(self,*args)
    return get1

# utils
tmpdir = './temp'

# latex
latex_template = """\\documentclass{article}

\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage[utf8]{inputenc}
\\usepackage{parskip}
\\usepackage{graphicx}
\\usepackage[colorlinks,linkcolor=blue]{hyperref}
\\usepackage{cleveref}

\\Crefformat{equation}{#2Equation~#1#3}

\\begin{document}

%s

\end{document}
"""

title_template = """\\begin{center}
{\\LARGE \\bf %s}
\\vspace{0.8cm}
\\end{center}"""

section_template = """\\%ssection{%s}"""

enum_template = """\\begin{enumerate}
%s
\\end{enumerate}"""

item_template = """\\begin{itemize}
%s
\\end{itemize}"""

display_template = """\\begin{align*}
%s
\\end{align*}"""

numbered_template = """\\begin{align} \\label{%s}
%s
\\end{align}"""

caption_template = """\\caption{%s}
"""
image_template = """\\begin{figure}
\\includegraphics[width=\\textwidth]{%s}
%s\\end{figure}"""

# differential escaping
def math_escape(inp):
  inp = re.sub(r'\\align','&',inp)
  inp = re.sub(r'\\gt','>',inp)
  inp = re.sub(r'\\lt','<',inp)
  return inp

def text_escape(inp):
  inp = re.sub(r'([\&_^#%])',r'\\\1',inp) # escaping
  inp = re.sub(r'\\([\*\"\`\[\@\[\]\(\)])',r'\1',inp) # unescaping
  inp = re.sub(r'\\\^',r'\\textasciicircum',inp)
  return inp

# markdown lexer-parser
ops = r'(?<!\\)(\$|\*\*|\*|\"|\`|\^\[|\@\[|\])'
ops_re = re.compile(ops)

starts = ['$','*','**','\"','`','[','^[','@[']
ends = ['$','*','**','\"','`',')',']',']']
static = ['$']
endof = dict(zip(starts,ends))
reduce = {
  '$' : lambda s: '$%s$' % math_escape(s),
  '*' : lambda s: '\\textit{%s}' % s,
  '**': lambda s: '\\textbf{%s}' % s,
  '`' : lambda s: '\\texttt{%s}' % s,
  '\"': lambda s: '``%s\'\'' % s,
  '[' : lambda s: '\\url{%s}{%s}' % tuple(s.split('](')),
  '^[': lambda s: '\\footnote{%s}' % s,
  '@[': lambda s: '\\Cref{%s}' % s
}

# well this got complicated
def parse_markdown(text):
  stack = []
  buffs = ['']
  pos = 0
  for ret in ops_re.finditer(text):
    op = ret.group()
    (beg,end) = ret.span()
    liter = len(stack) and stack[-1] in static
    term = len(stack) and op == endof[stack[-1]]
    if liter:
      if term:
        buffs[-1] += text[pos:beg]
      else:
        buffs[-1] += text[pos:end]
    else:
      buffs[-1] += text_escape(text[pos:beg])
    if term:
      proc = buffs.pop()
      dop = stack.pop()
      buffs[-1] += reduce[dop](proc)
    elif op in starts and not liter:
      stack.append(op)
      buffs.append('')
    pos = end
  buffs[0] += text_escape(text[pos:])
  return buffs[0]

def construct_latex(text):
  images = []
  def gen_latex(cell):
    # block level operations
    if cell.startswith('#'):
      if cell.startswith('#!'):
        text = cell[2:].strip()
        text = title_template % parse_markdown(text)
      else:
        ret = re.match(r'(#+) ?(.*)',cell)
        (pound,title) = ret.groups()
        level = len(pound)
        text = section_template % ('sub'*(level-1),parse_markdown(title))
    elif cell.startswith('+'):
      items = cell[1:].split('\n+')
      text = enum_template % '\n'.join(['\\item %s\n' % parse_markdown(item) for item in items])
    elif cell.startswith('-'):
      items = cell[1:].split('\n-')
      text = item_template % '\n'.join(['\\item %s\n' % parse_markdown(item) for item in items])
    elif cell.startswith('!'):
      ret = re.match(r'\[([^\]]*)\](.*)',cell[1:])
      (url,cap) = ret.groups()
      images.append(url)
      if len(cap) > 0:
        cap = parse_markdown(cap[1:-1])
        ctxt = caption_template % cap
      ret = re.search(r'(^|:)//(.*)',url)
      if ret:
        (rpath,) = ret.groups()
      else:
        rpath = url
      (_,fname) = os.path.split(rpath)
      text = image_template % (fname,ctxt)
    elif cell.startswith('$$'):
      math = cell[2:].strip()
      ret = re.match(r'\[([^\]]*)\]',math)
      if ret:
        (label,) = ret.groups()
        math = math[ret.end():]
        text = numbered_template % (label,math_escape(math))
      else:
        text = display_template % math_escape(math)
    else:
      text = parse_markdown(cell)

    return text

  cells = filter(len,map(str.strip,text.split('\n\n')))
  tex = '\n\n'.join([gen_latex(cell) for cell in cells])

  latex = latex_template % tex
  print(latex)

  return (latex,images)

# initialize/open database
def read_cells(fname):
  try:
    fid = open(fname,'r+',encoding='utf-8')
    text = fid.read()
    fid.close()
  except:
    text = u''

  # construct cell dictionary
  CellStruct = namedtuple('CellStruct','id body')
  tcells = map(str.strip,text.split('\n\n'))
  fcells = filter(len,tcells)
  if fcells:
    cells = {i: {'prev': i-1, 'next': i+1, 'body': s} for (i,s) in enumerate(fcells)}
    cells[max(cells.keys())]['next'] = -1
    cells[min(cells.keys())]['prev'] = -1
  else:
    cells = {0: {'prev': -1, 'next': 1, 'body': '#! Title'}, 1: {'prev':0, 'next': -1, 'body': 'Body text.'}}
  return cells

def gen_cells(cells):
  cur = [c for c in cells.values() if c['prev'] == -1]
  if cur:
    cur = cur[0]
  else:
    return
  while cur:
    yield cur
    nextid = cur['next']
    cur = cells[nextid] if nextid != -1 else None

def construct_markdown(cells):
  return '\n\n'.join(map(itemgetter('body'),gen_cells(cells)))

def get_base_name(fname):
  ret = re.match(r'(.*)\.md',fname)
  if ret:
    fname_new = ret.group(1)
  else:
    fname_new = fname
  return fname_new

# Tornado time
class AuthLoginHandler(tornado.web.RequestHandler):
  def get(self):
    try:
      errormessage = self.get_argument("error")
    except:
      errormessage = ""
    self.render("login.html",errormessage=errormessage)

  def check_permission(self, password, username):
    if username == username_true and password == password_true:
      return True
    return False

  def post(self):
    username = self.get_argument("username", "")
    password = self.get_argument("password", "")
    auth = self.check_permission(password,username)
    if auth:
      self.set_current_user(username)
      self.redirect("/")
    else:
      error_msg = "?error=" + tornado.escape.url_escape("Login incorrect")
      self.redirect("/auth/login/" + error_msg)

  def set_current_user(self, user):
    if user:
      print(user)
      self.set_secure_cookie("user",tornado.escape.json_encode(user))
    else:
      self.clear_cookie("user")

class AuthLogoutHandler(tornado.web.RequestHandler):
  def get(self):
    self.clear_cookie("user")
    self.redirect(self.get_argument("next","/"))

class BrowseHandler(tornado.web.RequestHandler):
  @authenticated
  def get(self):
    base = args.path
    files = sorted(os.listdir(base))
    dtype = [os.path.isdir(os.path.join(base,f)) for f in files]
    dirs = [f for (f,t) in zip(files,dtype) if t]
    docs = [f for (f,t) in zip(files,dtype) if not t and f.endswith('.md')]
    misc = [f for (f,t) in zip(files,dtype) if not t and not f.endswith('.md')]
    self.render("directory.html",dirname='',pardir='',dirs=dirs,docs=docs,misc=misc)

class DirectoryHandler(tornado.web.RequestHandler):
  @authenticated
  def get(self,targ):
    curdir = os.path.join(args.path,targ)
    (pardir,dirname) = os.path.split(targ)
    files = sorted(os.listdir(curdir))
    dtype = [os.path.isdir(os.path.join(curdir,f)) for f in files]
    dirs = [f for (f,t) in zip(files,dtype) if t]
    docs = [f for (f,t) in zip(files,dtype) if not t and f.endswith('.md')]
    misc = [f for (f,t) in zip(files,dtype) if not t and not f.endswith('.md')]
    self.render("directory.html",dirname=dirname,pardir=pardir,dirs=dirs,docs=docs,misc=misc)

class DemoHandler(tornado.web.RequestHandler):
  @authenticated
  def get(self):
    drand = '%s' % hex(random.getrandbits(128))[2:]
    fullpath = os.path.join(args.path,drand)
    os.mkdir(fullpath)
    shutil.copy(os.path.join('testing','demo.md'),fullpath)
    shutil.copy(os.path.join('testing','Jahnke_gamma_function.png'),fullpath)
    self.redirect('/directory/%s' % drand)

class EditorHandler(tornado.web.RequestHandler):
  @authenticated
  def get(self,path):
    (curdir,fname) = os.path.split(path)
    self.render("editor.html",path=path,curdir=curdir,fname=fname)

class MarkdownHandler(tornado.web.RequestHandler):
  @authenticated
  def post(self,fname):
    fullpath = os.path.join(args.path,fname)
    fid = open(fullpath,'r')
    text = fid.read()

    self.set_header('Content-Type','text/markdown')
    self.set_header('Content-Disposition','attachment; filename=%s' % fname)
    self.write(text)
  get = post

# class HtmlHandler(tornado.web.RequestHandler):
#   @authenticated
#   def post(self,fname):
#     fname_base = get_base_name(fname)
#     fname_html = '%s.html' % fname_base
#     path_html = os.path.join(tmpdir,fname_html)
#     data = open(path_html).read()
#
#     # generate html
#     css_extern = '<link href="http://dohan.dyndns.org/local/ellsworth/katex/katex.min.css" type="text/css" rel="stylesheet">'
#     css_files = ['css/proxima-nova.css','css/editor.css']
#     css_inline = ''
#     for css_file in css_files:
#       css_inline += open('static/%s' % css_file).read() + '\n\n'
#     css = '%s\n\n<style>\n\n%s\n\n</style>' % (css_extern,css_inline)
#     meta = '<meta charset="UTF-8">'
#     html = '<!DOCTYPE html>\n<html>\n\n<head>\n\n%s\n\n%s\n\n</head>\n\n<body>\n\n%s\n\n</body>\n\n</html>\n' % (meta,css,data)
#
#     self.set_header('Content-Type','application/pdf')
#     self.set_header('Content-Disposition','attachment; filename=%s' % fname_html)
#     self.write(html)
#   get = post

class LatexHandler(tornado.web.RequestHandler):
  @authenticated
  def post(self,fname):
    fullpath = os.path.join(args.path,fname)
    fid = open(fullpath,'r')
    text = fid.read()
    (latex,images) = construct_latex(text)

    ret = re.match(r'(.*)\.md',fname)
    if ret:
      fname_new = ret.group(1)
    else:
      fname_new = fname

    self.set_header('Content-Type','text/latex')
    self.set_header('Content-Disposition','attachment; filename=%s.tex' % fname_new)
    self.write(latex)
  get = post

class PdfHandler(tornado.web.RequestHandler):
  @authenticated
  def post(self,rpath):
    (rdir,fname) = os.path.split(rpath)
    fullpath = os.path.join(args.path,rpath)

    # generate latex
    fid = open(fullpath,'r')
    text = fid.read()
    (latex,images) = construct_latex(text)

    # copy over images
    for img in images:
      ret = re.search(r'(^|:)//(.*)',img)
      if ret:
        (rloc,) = ret.groups()
        (_,rname) = os.path.split(rloc)
        urllib.urlretrieve(url,os.path.join(tmpdir,rname))
      else:
        if img[0] == '/':
          ipath = img[1:]
        else:
          ipath = os.path.join(rdir,img)
        shutil.copy(os.path.join(args.path,ipath),tmpdir)

    ret = re.match(r'(.*)\.md',fname)
    if ret:
      fname_new = ret.group(1)
    else:
      fname_new = fname

    fname_tex = '%s.tex' % fname_new
    ftex = open(os.path.join(tmpdir,fname_tex),'w+')
    ftex.write(latex)
    ftex.close()

    cwd = os.getcwd()
    cmd = 'pdflatex -interaction=nonstopmode %s' % fname_tex
    os.chdir(tmpdir)
    os.system(cmd)
    os.system(cmd) # to resolve references
    os.chdir(cwd)

    fname_pdf = '%s.pdf' % fname_new
    fpdf = open(os.path.join(tmpdir,fname_pdf),'rb')
    data = fpdf.read()

    self.set_header('Content-Type','application/pdf')
    self.set_header('Content-Disposition','attachment; filename=%s' % fname_pdf)
    self.write(data)
  get = post

class ContentHandler(tornado.websocket.WebSocketHandler):
  def initialize(self):
    print("initializing")
    self.cells = {}

  def allow_draft76(self):
    return True

  def open(self,path):
    print("connection received: %s" % path)
    (self.dirname,self.fname) = os.path.split(path)
    self.basename = get_base_name(self.fname)
    self.temppath = os.path.join(tmpdir,self.fname)
    self.fullpath = os.path.join(args.path,path)

  def on_close(self):
    print("connection closing")

  def error_msg(self, error_code):
    if not error_code is None:
      json_string = json.dumps({"type": "error", "code": error_code})
      self.write_message("{0}".format(json_string))
    else:
      print("error code not found")

  def on_message(self, msg):
    try:
      print(u'received message: {0}'.format(msg))
    except Exception as e:
      print(e)
    data = json.loads(msg)
    (cmd,cont) = (data['cmd'],data['content'])
    if cmd == 'query':
      self.cells = read_cells(self.fullpath)
      vcells = [{'cid': i, 'prev': c['prev'], 'next': c['next'], 'body': c['body']} for (i,c) in self.cells.items()]
      self.write_message(json.dumps({'cmd': 'results', 'content': vcells}))
    elif cmd == 'save':
      cid = int(cont['cid'])
      body = cont['body']
      self.cells[cid]['body'] = body
    elif cmd == 'create':
      newid = int(cont['newid'])
      prev = int(cont['prev'])
      next = int(cont['next'])
      if prev is not -1:
        self.cells[prev]['next'] = newid
      if next is not -1:
        self.cells[next]['prev'] = newid
      self.cells[newid] = {'prev': prev, 'next': next, 'body': ''}
    elif cmd == 'delete':
      cid = int(cont['cid'])
      prev = int(cont['prev'])
      next = int(cont['next'])
      if prev is not -1:
        self.cells[prev]['next'] = next
      if next is not -1:
        self.cells[next]['prev'] = prev
      del self.cells[cid]
    elif cmd == 'write':
      output = construct_markdown(self.cells)
      print
      print('Saving.')
      print(output)
      fid = codecs.open(self.temppath,'w+',encoding='utf-8')
      fid.write(output)
      fid.close()
      os.system('mv %s %s' % (self.temppath,self.fullpath))
    elif cmd == 'revert':
      self.cells = read_cells(self.fullpath)
      vcells = [{'cid': i, 'prev': c['prev'], 'next': c['next'], 'body': c['body']} for (i,c) in self.cells.items()]
      self.write_message(json.dumps({'cmd': 'results', 'content': vcells}))
    elif cmd == 'html':
      fname_html = '%s.html' % self.basename
      path_html = os.path.join(tmpdir,fname_html)
      file_html = open(path_html,'w+')
      file_html.write(cont)
      self.write_message(json.dumps({'cmd': 'html', 'content': ''}))

class FileHandler(tornado.websocket.WebSocketHandler):
  def initialize(self):
    print("initializing")

  def allow_draft76(self):
    return True

  def open(self,dirname):
    print("connection received")
    self.dirname = dirname

  def on_close(self):
    print("connection closing")

  def error_msg(self, error_code):
    if not error_code is None:
      json_string = json.dumps({"type": "error", "code": error_code})
      self.write_message("{0}".format(json_string))
    else:
      print("error code not found")

  def on_message(self, msg):
    try:
      print(u'received message: {0}'.format(msg))
    except Exception as e:
      print(e)
    data = json.loads(msg)
    (cmd,cont) = (data['cmd'],data['content'])
    if cmd == 'create':
      fullpath = os.path.join(args.path,self.dirname,cont)
      exists = True
      try:
        os.stat(fullpath)
      except:
        exists = False
      if exists:
        print('File exists!')
        return
      fid = open(fullpath,'w+')
      fid.write('#! Title\n\nBody text.')
      fid.close()

# tornado content handlers
class Application(tornado.web.Application):
  def __init__(self):
    if args.demo:
      handlers = [(r"/?", DemoHandler)]
    else:
      handlers = [(r"/?", BrowseHandler)]

    handlers += [
      (r"/directory/(.*)", DirectoryHandler),
      (r"/auth/login/?", AuthLoginHandler),
      (r"/auth/logout/?", AuthLogoutHandler),
      (r"/editor/(.+)", EditorHandler),
      (r"/markdown/(.+)", MarkdownHandler),
      # (r"/html/(.+)", HtmlHandler),
      (r"/latex/(.+)", LatexHandler),
      (r"/pdf/(.+)", PdfHandler),
      (r"/elledit/(.*)", ContentHandler),
      (r"/diredit/(.*)", FileHandler),
      (r"/local/(.*)", tornado.web.StaticFileHandler, {"path": args.path}),
    ]

    settings = dict(
      app_name=u"Elltwo Editor",
      template_path="templates",
      static_path="static",
      cookie_secret=cookie_secret
    )

    tornado.web.Application.__init__(self, handlers, debug=True, **settings)

# create server
application = Application()
application.listen(args.port)
tornado.ioloop.IOLoop.current().start()
