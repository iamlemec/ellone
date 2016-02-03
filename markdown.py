# https://github.com/toshiya/my-markdown-parser

import os
import re
from ply import lex, yacc

def html(x):
    return x if type(x) is str else x.html()

def tex(x):
    return x if type(x) is str else x.tex()

def md(x):
    return x if type(x) is str else x.md()

#
# top level elements
#

class CellList:
    def __init__(self,elements):
        self.elements = elements

    def __str__(self):
        return '\n\n'.join([str(l) for l in self.elements])

    def html(self):
        return '\n\n'.join([html(l) for l in self.elements])

    def tex(self):
        return '\n\n'.join([tex(l) for l in self.elements])

    def md(self):
        return '\n\n'.join([md(l) for l in self.elements])

#
# block elements
#

class Paragraph:
    def __init__(self,elements):
        self.elements = elements

    def __str__(self):
        return ''.join([str(l) for l in self.elements])

    def html(self):
        return '<p>\n%s\n</p>' % ''.join([html(l) for l in self.elements])

    def tex(self):
        return ''.join([tex(l) for l in self.elements])

    def md(self):
        return ''.join([md(l) for l in self.elements])

class Title:
    def __init__(self,elements):
        self.elements = elements

    def __str__(self):
        return 'Title(text=%s)' % str(self.elements)

    def html(self):
        return '<header>\n<h1 class="title">%s</h1>\n</header>' % html(self.elements)

    def tex(self):
        return '\\begin{center}\n{\LARGE \\bf %s}\n\\end{center}' % tex(self.elements)

    def md(self):
        return '#! %s' % md(self.elements)

class Header:
    def __init__(self,elements,level):
        self.elements = elements
        self.level = level

    def __str__(self):
        return 'Header(level=%d,text=%s)' % (self.level,str(self.elements))

    def html(self):
        return '<h%d class="title">%s</h2>' % (self.level,html(self.elements))

    def tex(self):
        return '\\%ssection{%s}' % ('sub'*(self.level-1),tex(self.elements))

    def md(self):
        return '%s %s' % (self.level*'#',md(self.elements))

class OrderedList:
    def __init__(self,rows):
        self.rows = rows

    def __str__(self):
        return 'OrderedList(items=[%s])' % ','.join(['%s' % str(r) for r in self.rows])

    def html(self):
        return '<ol>\n%s\n</ol>' % '\n'.join(['<li>%s</li>' % html(r) for r in self.rows])

    def tex(self):
        return '\\begin{enumerate}\n%s\n\\end{enumerate}' % '\n'.join(['\\item %s' % tex(r) for r in self.rows])

    def md(self):
        return '\n'.join(['+ %s' % md(row) for row in self.rows])

class UnorderedList:
    def __init__(self,rows):
        self.rows = rows

    def __str__(self):
        return 'UnorderedList(items=[%s])' % ','.join(['%s' % str(r) for r in self.rows])

    def html(self):
        return '<ul>\n%s\n</ul>' % '\n'.join(['<li>%s</li>' % html(r) for r in self.rows])

    def tex(self):
        return '\\begin{itemize}\n%s\n\\end{itemize}' % '\n'.join(['\\item %s' % tex(r) for r in self.rows])

    def md(self):
        return '\n'.join(['- %s' % md(row) for row in self.rows])

class Image:
    def __init__(self,src,cap=None):
        self.src = src
        self.cap = cap

    def __str__(self):
        return 'Image(src=%s,caption=%s)' % (self.src,str(self.cap) if self.cap is not None else '')

    def html(self):
        if self.cap is None:
            return '<figure class="image">\n<img src="%s">\n</figure>' % self.src
        else:
            return '<figure class="image">\n<img src="%s">\n<figcaption>%s</figcaption>\n</figure>' % (self.src,html(self.cap))

    def tex(self):
        if self.cap is None:
            return '\\begin{figure}\n\\includegraphics[width=\\textwidth]{%s}\n\\end{figure}' % self.src
        else:
            return '\\begin{figure}\n\\includegraphics[width=\\textwidth]{%s}\n\\caption{%s}\n\\end{figure}' % (self.src,tex(self.cap))

    def md(self):
        return '![%s](%s)' % (self.src,md(self.cap) if self.cap is not None else '')

class Equation:
    def __init__(self,math,label=None):
        self.math = math
        self.label = label

    def __str__(self):
        return 'Equation(tex=%s,label=%s)' % (self.math,self.label if self.label is not None else '')

    def html(self):
        if self.label is None:
            return '<equation>\n%s\n</equation>' % self.math
        else:
            return '<equation id="%s">\n%s\n</equation>' % (self.label,self.math)

    def tex(self):
        if self.label is None:
            return '\\begin{align*}\n%s\n\\end{align*}' % self.math
        else:
            return '\\begin{align} \\label{%s}\n%s\n\\end{align}' % (self.label,self.math)

    def md(self):
        if self.label is None:
            return '$$ %s' % self.math
        else:
            return '$$ [%s] %s' % (self.math,self.label)

#
# inline elements
#

class ElementList:
    def __init__(self,elements):
        self.elements = elements

    def __str__(self):
        return ''.join([str(l) for l in self.elements])

    def html(self):
        return ''.join([html(l) for l in self.elements])

    def tex(self):
        return ''.join([tex(l) for l in self.elements])

    def md(self):
        return ''.join([md(l) for l in self.elements])

class Link:
    def __init__(self,href,text):
        self.href = href
        self.text = text

    def __str__(self):
        return 'Link(href=%s,content=%s)' % (self.href,str(self.text))

    def html(self):
        return '<a href="%s">%s</a>' % (self.href,html(self.text))

    def tex(self):
        return '\\href{%s}{%s}' % (self.href,tex(self.text))

    def md(self):
        return '[%s](%s)' % (md(self.text),self.href)

class Bold:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Bold(text=%s)' % self.text

    def html(self):
        return '<b>%s</b>' % self.text

    def tex(self):
        return '\\textbf{%s}' % self.text

    def md(self):
        return '**%s**' % self.text

class Ital:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Ital(text=%s)' % self.text

    def html(self):
        return '<i>%s</i>' % self.text

    def tex(self):
        return '\\textit{%s}' % self.text

    def md(self):
        return '*%s*' % self.text

class Code:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Code(text=%s)' % self.text

    def html(self):
        return '<code>%s</code>' % self.text

    def tex(self):
        return '\\texttt{%s}' % self.text

    def md(self):
        return '`%s`' % self.text

class Math:
    def __init__(self,math):
        self.math = math

    def __str__(self):
        return 'Math(tex=%s)' % self.math

    def html(self):
        return '$%s$' % self.math

    def tex(self):
        return '$%s$' % self.math

    def md(self):
        return '$%s$' % self.math

class Reference:
    def __init__(self,targ):
        self.targ = targ

    def __str__(self):
        return 'Reference(targ=%s)' % self.targ

    def html(self):
        return '<ref target="%s"></ref>' % self.targ

    def tex(self):
        return '\\Cref{%s}' % self.targ

    def md(self):
        return '@[%s]' % self.targ

class Footnote:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Footnote(text=%s)' % str(self.text)

    def html(self):
        return '<footnote>%s</footnote>' % html(self.text)

    def tex(self):
        return '\\footnote{%s}' % tex(self.text)

    def md(self):
        return '^[%s]' % md(self.text)

#
# lexing
#

class Lexer():
    states = (
        ('math','exclusive'),
    )

    tokens = (
        "LEFT_BRA",
        "REF_BRA",
        "FOOT_BRA",
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

    t_LEFT_BRA = r"(?<![@\^])\["
    t_REF_BRA = r"@\["
    t_FOOT_BRA = r"\^\["
    t_RIGHT_BRA = r"\]"
    t_LEFT_PAR = r"\("
    t_RIGHT_PAR = r"\)"
    t_BOLD_DELIM = r"\*\*"
    t_ITAL_DELIM = r"\*(?!\*)"
    t_CODE_DELIM = r"`"
    t_LITERAL = r"([^\[\]\(\)\*\$`@\^]|(?<=\\)[\[\]\(\)\*\$`]|[@\^](?!\[))+"

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

#
# parsing
#

class Yaccer():
    def __init__(self,lexmod):
        self.tokens = lexmod.tokens

    def p_elements1(self,p):
        """elements : element"""
        p[0] = [p[1]]

    def p_elements2(self,p):
        """elements : element elements"""
        p[0] = [p[1]] + p[2]

    def p_element(self,p):
        """element : decor
                   | mblock
                   | link
                   | reference
                   | footnote"""
        p[0] = p[1]

    def p_mblock(self,p):
        """mblock : math TEX mend"""
        p[0] = Math(p[2])

    def p_elements_paren(self,p):
        "elements : LEFT_PAR elements RIGHT_PAR"
        p[0] = [p[1]] + p[2] + [p[3]]

    def p_elements_paren_empty(self,p):
        "elements : LEFT_PAR RIGHT_PAR"
        p[0] = [p[1],p[2]]

    def p_bracket_pair1(self,p):
        "elements : LEFT_BRA elements RIGHT_BRA"
        p[0] = [p[1]] + p[2] + [p[3]]

    def p_bracket_pair2(self,p):
        "elements : LEFT_BRA decor RIGHT_BRA"
        p[0] = [p[1]] + [p[2]] + [p[3]]

    def p_elements_brack_empty(self,p):
        "elements : LEFT_BRA RIGHT_BRA"
        p[0] = [p[1],p[2]]

    def p_reference(self,p):
        "reference : REF_BRA LITERAL RIGHT_BRA"
        p[0] = Reference(p[2])

    def p_footnote(self,p):
        "footnote : FOOT_BRA elements RIGHT_BRA"
        p[0] = Footnote(ElementList(p[2]))

    def p_link(self,p):
        "link : LEFT_BRA decor RIGHT_BRA LEFT_PAR LITERAL RIGHT_PAR"
        p[0] = Link(p[5],p[2])

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

#
# build lexer and yaccer
#

lexmod = Lexer()
lexer = lex.lex(module=lexmod)

yaccmod = Yaccer(lexmod)
yaccer = yacc.yacc(module=yaccmod,outputdir='parser')

#
# external interface
#

def parse_markdown(s):
    return ElementList(yaccer.parse(s))

def parse_cell(cell):
    # block level operations
    if cell.startswith('#'):
        if cell.startswith('#!'):
            text = cell[2:].strip()
            return Title(parse_markdown(text))
        else:
            ret = re.match(r'(#+) ?(.*)',cell)
            (pound,title) = ret.groups()
            level = len(pound)
            return Header(parse_markdown(title),level)
    elif cell.startswith('+'):
        items = [item.strip() for item in cell[1:].split('\n+')]
        return OrderedList([parse_markdown(item) for item in items])
    elif cell.startswith('-'):
        items = [item.strip() for item in cell[1:].split('\n-')]
        return UnorderedList([parse_markdown(item) for item in items])
    elif cell.startswith('!'):
        ret = re.match(r'\[([^\]]*)\]\((.*)\)$',cell[1:].strip())
        (cap,url) = ret.groups()
        if len(cap) > 0:
            cap = parse_markdown(cap)
        else:
            cap = None
        ret = re.search(r'(^|:)//(.*)',url)
        if ret:
            (rpath,) = ret.groups()
        else:
            rpath = url
        (_,fname) = os.path.split(rpath)
        return Image(fname,cap)
    elif cell.startswith('$$'):
        math = cell[2:].strip()
        ret = re.match(r'\[([^\]]*)\](.*)',math)
        if ret:
            (label,tex) = ret.groups()
        else:
            (label,tex) = (None,math)
        return Equation(tex.strip(),label)
    else:
        return Paragraph(parse_markdown(cell).elements)

def parse_doc(text):
    cells = [c.strip() for c in text.split('\n\n')]
    output = [parse_cell(c) for c in cells]
    return CellList(output)

#
# document converters
#

html_template = """
<!doctype html>
<html>

<head>

<script src="ellsworth/js/elltwo_load.js" type="text/javascript"></script>
<script type="text/javascript">
ElltwoAutoload({
  theme: "shakirm"
});
</script>

</head>

<body class="elltwo">

<div class="content">

%s

</div>

</body>
</html>
""".strip()

latex_template = """
\\documentclass[12pt]{article}

\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage[utf8]{inputenc}
\\usepackage{parskip}
\\usepackage{graphicx}
\\usepackage[colorlinks,linkcolor=blue]{hyperref}
\\usepackage{cleveref}

\\Crefformat{equation}{#2Equation~#1#3}

\\setlength{\\parindent}{0cm}
\\setlength{\\parskip}{0.5cm}
\\renewcommand{\\baselinestretch}{1.1}

\\begin{document}

%s

\\end{document}
""".strip()

def convert_html(text):
    cells = parse_doc(text)
    ret = html_template % html(cells)
    return ret

def convert_markdown(text):
    cells = parse_doc(text)
    ret = md(cells)
    return ret

def convert_latex(text):
    cells = parse_doc(text)
    ret = latex_template % tex(cells)
    return ret
