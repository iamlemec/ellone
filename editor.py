import os
import sys
import re
import json
import argparse
import traceback
from operator import itemgetter
from collections import namedtuple
import codecs

import tornado.ioloop
import tornado.web
import tornado.websocket

# utils
tmpdir = './documents'

# latex
latex_template = """\\documentclass{article}

\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage[utf8]{inputenc}

\\begin{document}

%s

\end{document}
"""

title_template = """\\begin{center}
{\\LARGE \\bf %s}
\\end{center}"""

section_template = """\\%ssection{%s}"""

enum_template = """\\begin{enumerate}
%s
\\end{enumerate}"""

def gen_latex(cells):
  for cell in cells:
    if cell.startswith('#!'):
      yield title_template % cell[2:].strip()
      continue
    ret = re.match(r'(#+) ?(.*)',cell)
    if ret:
      (pound,title) = ret.groups()
      level = len(pound)
      yield section_template % ('sub'*(level-1),title)
      continue
    if cell.startswith('1.'):
      items = cell.split('\n')
      text = ''
      for item in items:
        ret = re.match(r'[0-9]\. ?(.*)',item)
        if ret:
          text += '\\item %s\n' % ret.group(1)
        else:
          text += '%s\n' % item
      yield enum_template % text
      continue
    yield cell

def construct_latex(text):
  text = re.sub(r'\"(.*?)\"','``\\1\'\'',text)
  cells = filter(len,map(str.strip,text.split('\n\n')))
  tex = '\n\n'.join(gen_latex(cells))
  latex = latex_template % tex
  return latex

# parse input arguments
parser = argparse.ArgumentParser(description='Elltwo Server.')
parser.add_argument('--path', type=str, default='.', help='path for files')
parser.add_argument('--port', type=int, default=8500, help='port to serve on')
args = parser.parse_args()

# initialize/open database
def read_cells(fname):
  try:
    fid = open(fname,'r+')
    text = unicode(fid.read(),"utf-8")
    fid.close()
  except:
    text = u''

  # construct cell dictionary
  CellStruct = namedtuple('CellStruct','id body')
  tcells = map(unicode.strip,text.split('\n\n'))
  fcells = filter(len,tcells)
  if fcells:
    cells = {i: {'prev': i-1, 'next': i+1, 'body': s} for (i,s) in enumerate(fcells)}
    cells[max(cells.keys())]['next'] = -1
    cells[min(cells.keys())]['prev'] = -1
  else:
    cells = {0: {'prev': -1, 'next': 1, 'body': '#! Title'}, 1: {'prev':0, 'next': -1, 'body': 'Body text.'}}
  return cells

def gen_cells(cells):
  cur = filter(lambda c: c['prev'] == -1,cells.values())
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

# Tornado time
class DirectoryHandler(tornado.web.RequestHandler):
    def get(self):
        files = os.listdir(args.path)
        self.render("directory.html",files=files)

class EditorHandler(tornado.web.RequestHandler):
    def get(self,fname):
        self.render("editor.html",fname=fname)

class MarkdownHandler(tornado.web.RequestHandler):
    def post(self,fname):
        fullpath = os.path.join(args.path,fname)
        fid = open(fullpath,'r')
        text = fid.read()

        self.set_header('Content-Type','text/markdown')
        self.set_header('Content-Disposition','attachment; filename=%s' % fname)
        self.write(text)
    get = post

class LatexHandler(tornado.web.RequestHandler):
    def post(self,fname):
        fullpath = os.path.join(args.path,fname)
        fid = open(fullpath,'r')
        text = fid.read()
        latex = construct_latex(text)

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
    def post(self,fname):
        fullpath = os.path.join(args.path,fname)
        fid = open(fullpath,'r')
        text = fid.read()
        latex = construct_latex(text)

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
        os.chdir(tmpdir)
        os.system('pdflatex %s' % fname_tex)
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
        print "initializing"
        self.cells = {}

    def allow_draft76(self):
        return True

    def open(self,fname):
        print "connection received: %s" % fname
        self.fname = fname
        self.temppath = os.path.join(tmpdir,fname)
        self.fullpath = os.path.join(args.path,fname)

    def on_close(self):
        print "connection closing"

    def error_msg(self, error_code):
        if not error_code is None:
            json_string = json.dumps({"type": "error", "code": error_code})
            self.write_message("{0}".format(json_string))
        else:
            print "error code not found"

    def on_message(self, msg):
        try:
          print u'received message: {0}'.format(msg)
        except Exception as e:
          print e
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
          print 'Saving.'
          print output
          fid = codecs.open(self.temppath,'w+',encoding='utf-8')
          fid.write(output)
          fid.close()
          os.system('mv %s %s' % (self.temppath,self.fullpath))
        elif cmd == 'revert':
          self.cells = read_cells(self.fullpath)
          vcells = [{'cid': i, 'prev': c['prev'], 'next': c['next'], 'body': c['body']} for (i,c) in self.cells.items()]
          self.write_message(json.dumps({'cmd': 'results', 'content': vcells}))

class FileHandler(tornado.websocket.WebSocketHandler):
    def initialize(self):
        print "initializing"

    def allow_draft76(self):
        return True

    def open(self):
        print "connection received"

    def on_close(self):
        print "connection closing"

    def error_msg(self, error_code):
        if not error_code is None:
            json_string = json.dumps({"type": "error", "code": error_code})
            self.write_message("{0}".format(json_string))
        else:
            print "error code not found"

    def on_message(self, msg):
        try:
          print u'received message: {0}'.format(msg)
        except Exception as e:
          print e
        data = json.loads(msg)
        (cmd,cont) = (data['cmd'],data['content'])
        if cmd == 'create':
          fullpath = os.path.join(args.path,cont)
          exists = True
          try:
            os.stat(fullpath)
          except:
            exists = False
          if exists:
            print 'File exists!'
            return
          fid = open(fullpath,'w+')
          fid.write('#! Title\n\nBody text.')
          fid.close()

# tornado content handlers
class Application(tornado.web.Application):
    def __init__(self):
        handlers = [
            (r"/editor/?", DirectoryHandler),
            (r"/editor/([^/]+)", EditorHandler),
            (r"/markdown/([^/]+)", MarkdownHandler),
            (r"/latex/([^/]+)", LatexHandler),
            (r"/pdf/([^/]+)", PdfHandler),
            (r"/elledit/([^/]*)", ContentHandler),
            (r"/diredit/?", FileHandler)
        ]
        settings = dict(
            app_name=u"Elltwo Editor",
            template_path="templates",
            static_path="static",
            xsrf_cookies=True,
        )
        tornado.web.Application.__init__(self, handlers, debug=True, **settings)

# create server
application = Application()
application.listen(args.port)
tornado.ioloop.IOLoop.current().start()
