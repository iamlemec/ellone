import os
import sys
import json
import argparse
import traceback
from operator import itemgetter
from collections import namedtuple

import tornado.ioloop
import tornado.web
import tornado.websocket

# utils

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
    cells[max(cells.keys())]['next'] = None
    cells[min(cells.keys())]['prev'] = None
  else:
    cells = {0: {'prev': None, 'next': 1, 'body': '#! Title'}, 1: {'prev':0, 'next': None, 'body': 'Body text.'}}
  return cells

def gen_cells(cells):
  cur = filter(lambda c: c['prev'] == None,cells.values())
  if cur:
    cur = cur[0]
  else:
    return
  while cur:
    yield cur
    nextid = cur['next']
    cur = cells[nextid] if nextid else None

# Tornado time
class DirectoryHandler(tornado.web.RequestHandler):
    def get(self):
        files = os.listdir(args.path)
        self.render("directory.html",files=files)

class EditorHandler(tornado.web.RequestHandler):
    def get(self,fname):
        self.render("editor.html",fname=fname)

class ContentHandler(tornado.websocket.WebSocketHandler):
    def initialize(self):
        print "initializing"
        self.cells = {}

    def allow_draft76(self):
        return True

    def open(self,fname):
        print "connection received: %s" % fname
        self.fname = fname
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
          prev = cont['prev']
          prev = int(prev) if prev != 'null' else None
          next = cont['next']
          next = int(next) if next != 'null' else None
          if prev is not None:
            self.cells[prev]['next'] = newid
          if next is not None:
            self.cells[next]['prev'] = newid
          self.cells[newid] = {'prev': prev, 'next': next, 'body': ''}
        elif cmd == 'delete':
          cid = int(cont['cid'])
          prev = cont['prev']
          prev = int(prev) if prev != 'null' else None
          next = cont['next']
          next = int(next) if next != 'null' else None
          if prev is not None:
            self.cells[prev]['next'] = next
          if next is not None:
            self.cells[next]['prev'] = prev
          del self.cells[cid]
        elif cmd == 'write':
          ordered = list(gen_cells(self.cells))
          output = '\n\n'.join(map(itemgetter('body'),ordered))
          print
          print 'Saving.'
          print ordered
          fid = open(self.fullpath,'w+')
          fid.write(output)
          fid.close()
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
