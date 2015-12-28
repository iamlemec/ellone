# https://github.com/toshiya/my-markdown-parser

from ply import lex, yacc

# structure
class Cell:
    def __init__(self,elements):
        self.elements = elements

    def __str__(self):
        return ''.join([str(l) for l in self.elements])

class Link:
    def __init__(self,href,text):
        self.href = href
        self.text = text

    def __str__(self):
        return 'Link(href=%s,content=%s)' % (self.href,self.text)

class Math:
    def __init__(self,tex):
        self.tex = tex

    def __str__(self):
        return 'Math(tex=%s)' % self.tex

class Bold:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Bold(text=%s)' % self.text

class Italics:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Italics(text=%s)' % self.text

# lexing
class Lexer():
    tokens = (
        "LEFT_BRA",
        "RIGHT_BRA",
        "LEFT_PAR",
        "RIGHT_PAR",
        "MATH_DELIM",
        "BOLD_DELIM",
        "ITAL_DELIM",
        "LITERAL"
    )

    t_LEFT_BRA = r"\["
    t_RIGHT_BRA = r"\]"
    t_LEFT_PAR = r"\("
    t_RIGHT_PAR = r"\)"
    t_MATH_DELIM = r"(?<!\\)\$"
    t_BOLD_DELIM = r"\*\*"
    t_ITAL_DELIM = r"\*(?!\*)"
    t_LITERAL = r"([0-9A-Za-z_,\-\.:/\^\+ \n]|(?<=\\)(\$|\[|\]))+"

    def t_error(self,t):
        print("Illegal character '%s'" % t.value[0])
        t.lexer.skip(1)

# parsing
class Yaccer():
    def __init__(self,lexmod):
        self.tokens = lexmod.tokens

    def p_elements(self,p):
        "elements : elements elements"
        p[0] = p[1] + p[2]

    def p_element(self,p):
        """elements : decor
                    | math
                    | link"""
        p[0] = [p[1]]

    def p_math(self,p):
        "math : MATH_DELIM LITERAL MATH_DELIM"
        p[0] = Math(p[2])

    def p_link(self,p):
        "link : LEFT_BRA decor RIGHT_BRA LEFT_PAR LITERAL RIGHT_PAR"
        p[0] = Link(p[5],p[2])

    def p_bold(self,p):
        "bold : BOLD_DELIM LITERAL BOLD_DELIM"
        p[0] = Bold(p[2])

    def p_ital(self,p):
        "ital : ITAL_DELIM LITERAL ITAL_DELIM"
        p[0] = Italics(p[2])

    def p_decor(self,p):
        """decor : bold
                 | ital
                 | LITERAL"""
        p[0] = p[1]

    def p_error(self,p):
        print("Syntax error at '%s'" % p)

# build lexer and yaccer
lexmod = Lexer()
lexer = lex.lex(module=lexmod)

yaccmod = Yaccer(lexmod)
yaccer = yacc.yacc(module=yaccmod,outputdir='parser')

def parse(s):
    return Cell(yaccer.parse(s,lexer=lexer))
