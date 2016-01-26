# https://github.com/toshiya/my-markdown-parser

from ply import lex, yacc

def html(x):
    return x if type(x) is str else x.html()

def tex(x):
    return x if type(x) is str else x.tex()

# structure
class Cell:
    def __init__(self,elements):
        self.elements = elements

    def __str__(self):
        return ''.join([str(l) for l in self.elements])

    def html(self):
        return ''.join([html(l) for l in self.elements])

    def tex(self):
        return ''.join([tex(l) for l in self.elements])

class Link:
    def __init__(self,href,text):
        self.href = href
        self.text = text

    def __str__(self):
        return 'Link(href=%s,content=%s)' % (self.href,self.text)

    def html(self):
        return '<a href="%s">%s</a>' % (self.href,html(self.text))

    def tex(self):
        return '\\href{%s}{%s}' % (self.href,tex(self.text))

class Bold:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Bold(text=%s)' % self.text

    def html(self):
        return '<b>%s</b>' % self.text

    def tex(self):
        return '\\textbf{%s}' % self.text

class Ital:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Ital(text=%s)' % self.text

    def html(self):
        return '<i>%s</i>' % self.text

    def tex(self):
        return '\\textit{%s}' % self.text

class Code:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Code(text=%s)' % self.text

    def html(self):
        return '<code>%s</code>' % self.text

    def tex(self):
        return '\\texttt{%s}' % self.text

# lexing
class Lexer():
    states = (
        ('math','exclusive'),
    )

    tokens = (
        "LEFT_BRA",
        "RIGHT_BRA",
        "LEFT_PAR",
        "RIGHT_PAR",
        "BOLD_DELIM",
        "ITAL_DELIM",
        "CODE_DELIM",
        "LITERAL",
        "math",
        "mend",
        "TEX"
    )

    t_LEFT_BRA = r"\["
    t_RIGHT_BRA = r"\]"
    t_LEFT_PAR = r"\("
    t_RIGHT_PAR = r"\)"
    t_BOLD_DELIM = r"\*\*"
    t_ITAL_DELIM = r"\*(?!\*)"
    t_CODE_DELIM = r"`"
    t_LITERAL = r"([^\[\]\(\)\*\$`]|(?<=\\)[\[\]\(\)\*\$`])+"

    def t_math(self,t):
        r"(?<!\\)\$"
        t.lexer.begin('math')
        return t

    def t_math_mend(self,t):
        r"(?<!\\)\$"
        t.lexer.begin('INITIAL')
        return t

    def t_math_TEX(self,t):
        r"([^\$]|(?<=\\)\$)+"
        return t

    def t_math_error(self,t):
        print("Illegal math character '%s'" % t.value[0])
        t.lexer.skip(1)

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
                    | mblock
                    | link"""
        p[0] = [p[1]]

    def p_mblock(self,p):
        """mblock : math TEX mend"""
        p[0] = p[1] + p[2] + p[3]

    def p_link(self,p):
        "link : LEFT_BRA decor RIGHT_BRA LEFT_PAR LITERAL RIGHT_PAR"
        p[0] = Link(p[5],p[2])

    def p_elements_paren(self,p):
        "elements : LEFT_PAR elements RIGHT_PAR"
        p[0] = [p[1]] + p[2] + [p[3]]

    def p_bold(self,p):
        "bold : BOLD_DELIM LITERAL BOLD_DELIM"
        p[0] = Bold(p[2])

    def p_ital(self,p):
        "ital : ITAL_DELIM LITERAL ITAL_DELIM"
        p[0] = Ital(p[2])

    def p_code(self,p):
        "code : CODE_DELIM LITERAL CODE_DELIM"
        p[0] = Code(p[2])

    def p_decor(self,p):
        """decor : bold
                 | ital
                 | code
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
    print(s)
    return Cell(yaccer.parse(s,lexer=lexer))
