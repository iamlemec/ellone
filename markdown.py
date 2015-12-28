# https://github.com/toshiya/my-markdown-parser

from ply import lex, yacc

# structure
class Markdown:
    def __init__(self,lines):
        self.lines = lines

    def __str__(self):
        return '\n\n'.join([str(l) for l in self.lines])

class Line:
    def __init__(self,blocks):
        self.blocks = blocks

    def __str__(self):
        return ''.join([str(b) for b in self.blocks])

class Block:
    def __init__(self,elems):
        self.elems = elems

    def __str__(self):
        return ''.join([str(e) for e in self.elems])

class Link:
    def __init__(self,href,text):
        self.href = href
        self.text = text

    def __str__(self):
        return 'Link(href="%s",content="%s")' % (self.href,self.text)

class Image:
    def __init__(self,source,text):
        self.source = source
        self.text = text

    def __str__(self):
        return 'Image(source="%s",text="%s")' % (self.source,self.text)

# lexing
class Lexer():
    tokens = (
        "LINK_OPEN",
        "IMAGE_OPEN",
        "CLOSE",
        "LEFT_PAR",
        "RIGHT_PAR",
        "CR",
        "BR",
        "LITERAL"
    )

    t_LINK_OPEN = r"\["
    t_IMAGE_OPEN = r"!\["
    t_CLOSE = r"\]"
    t_LEFT_PAR = r"\("
    t_RIGHT_PAR = r"\)"
    t_CR = r"\n"
    t_BR = r"\n\n"
    t_LITERAL = r"[0-9A-Za-z_,\-\.:/ ]+"

    def t_error(self,t):
        print("Illegal character '%s'" % t.value[0])
        t.lexer.skip(1)

    def build(self):
        return lex.lex(module=self)

# parsing
class Yaccer():
    def __init__(self,lexmod):
        self.tokens = lexmod.tokens

    def p_lines(self,p):
        "lines : lines lines"
        p[0] = p[1] + p[2]

    def p_line(self,p):
        "lines : blocks BR"
        p[0] = [Line(p[1])]

    def p_single_line(self,p):
        "lines : blocks"
        p[0] = [Line(p[1])]

    def p_blocks(self,p):
        "blocks : blocks blocks"
        p[0] = p[1] + p[2]

    def p_block_element(self,p):
        "blocks : element"
        p[0] = [p[1]]

    def p_block_link(self,p):
        "blocks : link"
        p[0] = [p[1]]

    def p_block_cr(self,p):
        "blocks : CR"
        p[0] = [p[1]]

    def p_link(self,p):
        "link : LINK_OPEN element CLOSE LEFT_PAR LITERAL RIGHT_PAR"
        p[0] = Link(p[5],p[2])

    def p_element_image(self,p):
        "element : image"
        p[0] = p[1]

    def p_element_literal(self,p):
        "element : LITERAL"
        p[0] = p[1]

    def p_image(self,p):
        "image : IMAGE_OPEN LITERAL CLOSE LEFT_PAR LITERAL RIGHT_PAR"
        p[0] = Image(p[5],p[2])

    def p_error(self,p):
        print("Syntax error at '%s'" % p)

# build lexer and yaccer
lexmod = Lexer()
lexer = lex.lex(module=lexmod)

yaccmod = Yaccer(lexmod)
yaccer = yacc.yacc(module=yaccmod,outputdir='parser')

def parse(s):
    return Markdown(yaccer.parse(s,lexer=lexer))
