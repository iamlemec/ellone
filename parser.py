# https://github.com/toshiya/my-markdown-parser

import os
import re
import sys
import shutil
from ply import lex, yacc

# top level functions

def escape_latex(s):
    s = re.sub(r'([#])',r'\\\1',s)
    s = re.sub(r'\^',r'\\textasciicircum',s)
    return s

def escape_tex(s):
    s = re.sub(r'\\gt(?![a-z])','>',s)
    s = re.sub(r'\\lt(?![a-z])','<',s)
    return s

def html(x):
    return x if type(x) is str else x.html()

def tex(x):
    return escape_latex(x) if type(x) is str else x.tex()

def md(x):
    return x if type(x) is str else x.md()

#
# top level elements
#

class CellList:
    def __init__(self,cells):
        self.cells = cells

    def __str__(self):
        return '\n\n'.join([str(l) for l in self.cells])

    def html(self):
        return '\n\n'.join([html(l) for l in self.cells])

    def tex(self):
        return '\n\n'.join([tex(l) for l in self.cells])

    def md(self):
        return '\n\n'.join([md(l) for l in self.cells])

#
# block elements
#

class Paragraph:
    def __init__(self,elements):
        self.elements = elements

    def __str__(self):
        return ''.join([str(l) for l in self.elements])

    def html(self):
        return '<p>%s</p>' % ''.join([html(l) for l in self.elements])

    def tex(self):
        return ''.join([tex(l) for l in self.elements])

    def md(self):
        return ''.join([md(l) for l in self.elements])

class Error:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Error(text="%s")' % self.text

    def html(self):
        return '<span style="color: red">%s</span>' % self.text

    def tex(self):
        return '{\\color{red} %s}' % self.text

    def md(self):
        return self.text

class Title:
    def __init__(self,elements):
        self.elements = elements

    def __str__(self):
        return 'Title(text="%s")' % str(self.elements)

    def html(self):
        return '<div class="doc-title">%s</div>' % html(self.elements)

    def tex(self):
        return '\\begin{center}\n{\LARGE \\bf %s}\n\\vspace*{0.8cm}\n\\end{center}' % tex(self.elements)

    def md(self):
        return '#! %s' % md(self.elements)

class Header:
    def __init__(self,elements,level):
        self.elements = elements
        self.level = level

    def __str__(self):
        return 'Header(level="%d",text="%s")' % (self.level,str(self.elements))

    def html(self):
        return '<div class="sec-title sec-lvl-%s" sec-lvl="%s">%s</div>' % (self.level,self.level,html(self.elements))

    def tex(self):
        return '\\%ssection{%s}' % ('sub'*(self.level-1),tex(self.elements))

    def md(self):
        return '%s %s' % (self.level*'#',md(self.elements))

class OrderedList:
    def __init__(self,rows):
        self.rows = rows

    def __str__(self):
        return 'OrderedList(items=[%s])' % ','.join(['"%s"' % str(r) for r in self.rows])

    def html(self):
        return '<ol>%s</ol>' % '\n'.join(['<li>%s</li>' % html(r) for r in self.rows])

    def tex(self):
        return '\\begin{enumerate}\n%s\n\\end{enumerate}' % '\n'.join(['\\item %s' % tex(r) for r in self.rows])

    def md(self):
        return '\n'.join(['+ %s' % md(row) for row in self.rows])

class UnorderedList:
    def __init__(self,rows):
        self.rows = rows

    def __str__(self):
        return 'UnorderedList(items=[%s])' % ','.join(['"%s"' % str(r) for r in self.rows])

    def html(self):
        return '<ul>%s</ul>' % '\n'.join(['<li>%s</li>' % html(r) for r in self.rows])

    def tex(self):
        return '\\begin{itemize}\n%s\n\\end{itemize}' % '\n'.join(['\\item %s' % tex(r) for r in self.rows])

    def md(self):
        return '\n'.join(['- %s' % md(row) for row in self.rows])

class Image:
    def __init__(self,src,cap=None):
        self.src = src
        self.cap = cap

    def __str__(self):
        return 'Image(src="%s",caption="%s")' % (self.src,str(self.cap) if self.cap is not None else '')

    def html(self):
        if self.cap is None:
            return '<figure><img src="%s"/></figure>' % self.src
        else:
            return '<figure><img src="%s"/><figcaption>%s</figcaption></figure>' % (self.src,html(self.cap))

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
        return 'Equation(tex="%s",label="%s")' % (self.math,self.label if self.label is not None else '')

    def html(self):
        if self.label is None:
            return '<div class="equation">%s</div>' % self.math
        else:
            return '<div class="equation numbered" id="%s">%s</div>' % (self.label,self.math)

    def tex(self):
        emath = re.sub(r'\\align(?![a-z])','&',escape_tex(self.math))
        if self.label is None:
            return '\\begin{align*}\n%s\n\\end{align*}' % emath
        else:
            return '\\begin{align} \\label{%s}\n%s\n\\end{align}' % (self.label,emath)

    def md(self):
        if self.label is None:
            return '$$ %s' % self.math
        else:
            return '$$ [%s] %s' % (self.math,self.label)

class CodeBlock:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'CodeBlock(text="%s")' % self.text

    def html(self):
        return '<pre><code>%s</code></pre>' % self.text

    def tex(self):
        return '\\begin{lstlisting}\n%s\n\\end{lstlisting}' % tex(self.text)

    def md(self):
        return '`%s`' % self.text

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
        return 'Link(href="%s",content="%s")' % (self.href,str(self.text))

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
        return 'Bold(text="%s")' % self.text

    def html(self):
        return '<strong>%s</strong>' % self.text

    def tex(self):
        return '\\textbf{%s}' % tex(self.text)

    def md(self):
        return '**%s**' % self.text

class Ital:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Ital(text="%s")' % self.text

    def html(self):
        return '<em>%s</em>' % self.text

    def tex(self):
        return '\\textit{%s}' % tex(self.text)

    def md(self):
        return '*%s*' % self.text

class Code:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Code(text="%s")' % self.text

    def html(self):
        return '<code>%s</code>' % self.text

    def tex(self):
        return '\\texttt{%s}' % tex(self.text)

    def md(self):
        return '`%s`' % self.text

class Math:
    def __init__(self,math):
        self.math = math

    def __str__(self):
        return 'Math(tex="%s")' % self.math

    def html(self):
        return '<span class="latex">%s</span>' % self.math

    def tex(self):
        return '$%s$' % escape_tex(self.math)

    def md(self):
        return '$%s$' % self.math

class Reference:
    def __init__(self,targ):
        self.targ = targ

    def __str__(self):
        return 'Reference(targ="%s")' % self.targ

    def html(self):
        return '<span class="reference" target="%s"></span>' % self.targ

    def tex(self):
        return '\\Cref{%s}' % self.targ

    def md(self):
        return '@[%s]' % self.targ

class Footnote:
    def __init__(self,text):
        self.text = text

    def __str__(self):
        return 'Footnote(text="%s")' % str(self.text)

    def html(self):
        return '<span class="footnote">%s</span>' % html(self.text)

    def tex(self):
        return '\\footnote{%s}' % tex(self.text)

    def md(self):
        return '^[%s]' % md(self.text)

#
# lexing
#

def unescape_markdown(s):
    return re.sub(r'(?<!\\)\\(\[|\]|\(|\)|\*|\@|`)',r'\1',s)

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

    def t_LITERAL(self,t):
        r"([^\[\]\(\)\*\$`@\^]|(?<=\\)[\[\]\(\)\*\$`]|[@\^](?!\[))+"
        t.value = unescape_markdown(t.value)
        return t

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
        """elements : elements element"""
        p[0] = p[1] + [p[2]]

    def p_element(self,p):
        """element : ital
                   | bold
                   | code
                   | mblock
                   | reference
                   | footnote
                   | link
                   | LEFT_PAR
                   | RIGHT_PAR
                   | LITERAL"""
        p[0] = p[1]

    def p_mblock(self,p):
        """mblock : math TEX mend"""
        p[0] = Math(p[2])

    def p_mblock_empty(self,p):
        """mblock : math mend"""
        p[0] = Math('')

    def p_reference(self,p):
        "reference : REF_BRA LITERAL RIGHT_BRA"
        p[0] = Reference(p[2])

    def p_footnote(self,p):
        "footnote : FOOT_BRA elements RIGHT_BRA"
        p[0] = Footnote(ElementList(p[2]))

    def p_link(self,p):
        "link : LEFT_BRA LITERAL RIGHT_BRA LEFT_PAR LITERAL RIGHT_PAR"
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

    def p_error(self,p):
        err = "Syntax error at '%s'" % p
        print(err)
        raise Exception(err)

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
    try:
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
            ret = re.match(r'\[([^\]]*)\](.*)', math, flags=re.DOTALL)
            if ret:
                (label,tex) = ret.groups()
            else:
                (label,tex) = (None,math)
            return Equation(tex.strip(),label)
        elif cell.startswith('``'):
            code = cell[2:].strip()
            return CodeBlock(code)
        else:
            return Paragraph(parse_markdown(cell).elements)
    except Exception as e:
        return Error(cell)

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

<link rel="stylesheet" href="http://doughanley.com/elltwo/static/css/elltwo.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.6.0/katex.min.css">

</head>

<body id="elltwo">

<span id="marquee"></span>

<div id="content">

%s

</div>

<script src="https://code.jquery.com/jquery-2.2.4.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.6.0/katex.min.js"></script>
<script src="http://doughanley.com/elltwo/static/js/elltwo.js"></script>

</body>

</html>
"""[1:]

section_end = """</section>"""

latex_template = """
\\documentclass[12pt]{article}

\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage[utf8]{inputenc}
\\usepackage{parskip}
\\usepackage{graphicx}
\\usepackage[colorlinks,linkcolor=blue]{hyperref}
\\usepackage{cleveref}
\\usepackage{listings}
\\usepackage[top=1.25in,bottom=1.25in,left=1.25in,right=1.25in]{geometry}

\\Crefformat{equation}{#2Equation~#1#3}

\\setlength{\\parindent}{0cm}
\\setlength{\\parskip}{0.5cm}
\\renewcommand{\\baselinestretch}{1.1}

\\begin{document}

%s

\\end{document}
"""[1:]

def convert_html(text):
    body = ''
    cells = parse_doc(text)
    body = html(cells)
    ret = html_template % body
    return ret

def convert_markdown(text):
    cells = parse_doc(text)
    ret = md(cells)
    return ret

def convert_latex(text):
    text = re.sub(r'([%&])', r'\\\1', text)
    cells = parse_doc(text).cells

    body = ''
    images = []

    pt = None
    for c in cells:
        t = type(c)

        # paragraph equation interplay
        if pt is None:
            pref = ''
        elif ((t is Equation) and ((pt is Paragraph) or (pt is Equation))) or ((t is Paragraph) and (pt is Equation)):
            pref = '\n'
        else:
            pref = '\n\n'
        body += pref + tex(c)

        # image storing
        if t is Image:
            images.append(c.src)

        pt = t

    ret = latex_template % body
    return (ret, images)

# utility stuff
if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Elltwo Converter.')
    parser.add_argument('input', type=str, nargs='?', default=None, help='input elltwo file')
    parser.add_argument('output', type=str, nargs='?', default=None, help='output file')
    parser.add_argument('--to', type=str, help='output format: tex, html')
    args = parser.parse_args()

    fname_inp = args.input
    fname_out = args.output
    out_format = args.to
    if fname_out is not None:
        if out_format is None:
            (base, ext) = os.path.splitext(fname_out)
            out_format = ext[1:]
    else:
        if fname_inp is not None:
            (base, ext) = os.path.splitext(fname_inp)
            fname_out = '%s%s%s' % (base, os.path.extsep, out_format)

    # print('converting %s to %s using %s' % (fname_inp, fname_out, out_format))

    if fname_inp is not None:
        with open(fname_inp) as fin:
            mark = fin.read()
    else:
        mark = sys.stdin.read()

    if out_format == 'tex':
        outp = convert_latex(mark)
    elif out_format == 'html':
        outp = convert_html(mark)
    elif out_format is None:
        outp = str(parse_doc(mark))
    else:
        raise('Unrecognized output format')

    if fname_out is not None:
        with open(fname_out, 'w+') as fout:
            fout.write(outp)
    else:
        print(outp)
