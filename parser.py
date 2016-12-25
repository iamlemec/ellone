#!/usr/bin/env python3

##
## elltwo parsing functions
##

#
# renderers
#

class HtmlRenderer(object):
    """The default HTML renderer for rendering Markdown.
    """

    def __init__(self, **kwargs):
        self.options = kwargs

    def placeholder(self):
        """Returns the default, empty output value for the renderer.

        All renderer methods use the '+=' operator to append to this value.
        Default is a string so rendering HTML can build up a result string with
        the rendered Markdown.

        Can be overridden by Renderer subclasses to be types like an empty
        list, allowing the renderer to create a tree-like structure to
        represent the document (which can then be reprocessed later into a
        separate format like docx or pdf).
        """
        return ''

    def block_code(self, code, lang=None):
        """Rendering block level code. ``pre > code``.

        :param code: text content of the code block.
        :param lang: language of the given code.
        """
        code = code.rstrip('\n')
        if not lang:
            code = escape(code, smart_amp=False)
            return '<pre><code>%s\n</code></pre>\n' % code
        code = escape(code, quote=True, smart_amp=False)
        return '<pre><code class="lang-%s">%s\n</code></pre>\n' % (lang, code)

    def block_quote(self, text):
        """Rendering <blockquote> with the given text.

        :param text: text content of the blockquote.
        """
        return '<blockquote>%s\n</blockquote>\n' % text.rstrip('\n')

    def header(self, text, level, raw=None):
        """Rendering header/heading tags like ``<h1>`` ``<h2>``.

        :param text: rendered text content for the header.
        :param level: a number for the header level, for example: 1.
        :param raw: raw text content of the header.
        """
        return '<h%d>%s</h%d>\n' % (level, text, level)

    def hrule(self):
        """Rendering method for ``<hr>`` tag."""
        if self.options.get('use_xhtml'):
            return '<hr />\n'
        return '<hr>\n'

    def list(self, body, ordered=True):
        """Rendering list tags like ``<ul>`` and ``<ol>``.

        :param body: body contents of the list.
        :param ordered: whether this list is ordered or not.
        """
        tag = 'ul'
        if ordered:
            tag = 'ol'
        return '<%s>\n%s</%s>\n' % (tag, body, tag)

    def list_item(self, text):
        """Rendering list item snippet. Like ``<li>``."""
        return '<li>%s</li>\n' % text

    def paragraph(self, text):
        """Rendering paragraph tags. Like ``<p>``."""
        return '<p>%s</p>\n' % text.strip(' ')

    def table(self, header, body):
        """Rendering table element. Wrap header and body in it.

        :param header: header part of the table.
        :param body: body part of the table.
        """
        return (
            '<table>\n<thead>%s</thead>\n'
            '<tbody>\n%s</tbody>\n</table>\n'
        ) % (header, body)

    def table_row(self, content):
        """Rendering a table row. Like ``<tr>``.

        :param content: content of current table row.
        """
        return '<tr>\n%s</tr>\n' % content

    def table_cell(self, content, **flags):
        """Rendering a table cell. Like ``<th>`` ``<td>``.

        :param content: content of current table cell.
        :param header: whether this is header or not.
        :param align: align of current table cell.
        """
        if flags['header']:
            tag = 'th'
        else:
            tag = 'td'
        align = flags['align']
        if not align:
            return '<%s>%s</%s>\n' % (tag, content, tag)
        return '<%s style="text-align:%s">%s</%s>\n' % (
            tag, align, content, tag
        )

    def double_emphasis(self, text):
        """Rendering **strong** text.

        :param text: text content for emphasis.
        """
        return '<strong>%s</strong>' % text

    def emphasis(self, text):
        """Rendering *emphasis* text.

        :param text: text content for emphasis.
        """
        return '<em>%s</em>' % text

    def codespan(self, text):
        """Rendering inline `code` text.

        :param text: text content for inline code.
        """
        text = escape(text.rstrip(), smart_amp=False)
        return '<code>%s</code>' % text

    def linebreak(self):
        """Rendering line break like ``<br>``."""
        if self.options.get('use_xhtml'):
            return '<br />\n'
        return '<br>\n'

    def strikethrough(self, text):
        """Rendering ~~strikethrough~~ text.

        :param text: text content for strikethrough.
        """
        return '<del>%s</del>' % text

    def text(self, text):
        """Rendering unformatted text.

        :param text: text content.
        """
        if self.options.get('parse_block_html'):
            return text
        return escape(text)

    def escape(self, text):
        """Rendering escape sequence.

        :param text: text content.
        """
        return escape(text)

    def link(self, link, title, text):
        """Rendering a given link with content and title.

        :param link: href link for ``<a>`` tag.
        :param title: title content for `title` attribute.
        :param text: text content for description.
        """
        link = escape_link(link)
        if not title:
            return '<a href="%s">%s</a>' % (link, text)
        title = escape(title, quote=True)
        return '<a href="%s" title="%s">%s</a>' % (link, title, text)

    def image(self, src, title):
        """Rendering a image with title and text.

        :param src: source link of the image.
        :param title: caption text of the image.
        """
        src = escape_link(src)
        if title:
            title = escape(title, quote=True)
            html = '<figure><img src="%s"><figcaption>%s</figcaption></figure>\n' % (src, title)
        else:
            html = '<figure><img src="%s"></figure>\n' % src
        return html

    def reflink(self, tag):
        """Rendering an in document reference.

        :param tag: tag to target.
        """
        html = '<ref>%s</ref>'
        return html % tag

    def newline(self):
        """Rendering newline element."""
        return ''

    def footnote(self, text):
        """Rendering the ref anchor of a footnote.

        :param key: identity key for the footnote.
        :param index: the index count of current footnote.
        """
        html = '<footnote>%s</footnote>'
        return html % text

    def equation(self, tex, tag):
        """Render display math.

        :param tex: tex specification.
        """
        if tag:
            html = '<equation id="%s">%s</equation>\n' % (tag, tex)
        else:
            html = '<equation>%s</equation>\n' % tex
        return html

    def math(self, tex):
        """Render inline math.

        :param tex: tex specification.
        """
        html = '<tex>%s</tex>'
        return html % tex

    def title(self, text):
        """Render page title.

        :param text: title text.
        """
        html = '<title>%s</title>\n'
        return html % text

class LatexRenderer(object):
    def __init__(self, **kwargs):
        self.options = kwargs

    def placeholder(self):
        return ''

    def block_code(self, code, lang=None):
        code = code.rstrip('\n')
        if not lang:
            code = escape(code, smart_amp=False)
            return '<pre><code>%s\n</code></pre>\n' % code
        code = escape(code, quote=True, smart_amp=False)
        return '<pre><code class="lang-%s">%s\n</code></pre>\n' % (lang, code)

    def block_quote(self, text):
        return '<blockquote>%s\n</blockquote>\n' % text.rstrip('\n')

    def header(self, text, level, raw=None):
        return '<h%d>%s</h%d>\n' % (level, text, level)

    def hrule(self):
        if self.options.get('use_xhtml'):
            return '<hr />\n'
        return '<hr>\n'

    def list(self, body, ordered=True):
        tag = 'ul'
        if ordered:
            tag = 'ol'
        return '<%s>\n%s</%s>\n' % (tag, body, tag)

    def list_item(self, text):
        return '<li>%s</li>\n' % text

    def paragraph(self, text):
        return '<p>%s</p>\n' % text.strip(' ')

    def table(self, header, body):
        return (
            '<table>\n<thead>%s</thead>\n'
            '<tbody>\n%s</tbody>\n</table>\n'
        ) % (header, body)

    def table_row(self, content):
        return '<tr>\n%s</tr>\n' % content

    def table_cell(self, content, **flags):
        if flags['header']:
            tag = 'th'
        else:
            tag = 'td'
        align = flags['align']
        if not align:
            return '<%s>%s</%s>\n' % (tag, content, tag)
        return '<%s style="text-align:%s">%s</%s>\n' % (
            tag, align, content, tag
        )

    def double_emphasis(self, text):
        return '<strong>%s</strong>' % text

    def emphasis(self, text):
        return '<em>%s</em>' % text

    def codespan(self, text):
        text = escape(text.rstrip(), smart_amp=False)
        return '<code>%s</code>' % text

    def linebreak(self):
        if self.options.get('use_xhtml'):
            return '<br />\n'
        return '<br>\n'

    def strikethrough(self, text):
        return '<del>%s</del>' % text

    def text(self, text):
        if self.options.get('parse_block_html'):
            return text
        return escape(text)

    def escape(self, text):
        return escape(text)

    def link(self, link, title, text):
        link = escape_link(link)
        if not title:
            return '<a href="%s">%s</a>' % (link, text)
        title = escape(title, quote=True)
        return '<a href="%s" title="%s">%s</a>' % (link, title, text)

    def image(self, src, title):
        src = escape_link(src)
        if title:
            title = escape(title, quote=True)
            html = '<figure><img src="%s"><figcaption>%s</figcaption></figure>\n' % (src, title)
        else:
            html = '<figure><img src="%s"></figure>\n' % src
        return html

    def reflink(self, tag):
        html = '<ref>%s</ref>'
        return html % tag

    def newline(self):
        return ''

    def footnote(self, text):
        html = '<footnote>%s</footnote>'
        return html % text

    def equation(self, tex, tag):
        if tag:
            html = '<equation id="%s">%s</equation>\n' % (tag, tex)
        else:
            html = '<equation>%s</equation>\n' % tex
        return html

    def math(self, tex):
        html = '<tex>%s</tex>'
        return html % tex

    def title(self, text):
        html = '<title>%s</title>\n'
        return html % text

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

<!-- <span id="marquee"></span> -->

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

#
# parser
#

def parse_markdown(s, output='html'):
    if output == 'html':
        renderer = HtmlRenderer()
    return mistwo.markdown(renderer=renderer)

def convert_html(s):
    body = parse_markdown(s, output='html')
    return html_template % body

def convert_latex(text):
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
