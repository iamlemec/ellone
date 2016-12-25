#!/usr/bin/env python3

##
## elltwo parsing functions
##

import mistwo

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

<script type="text/javascript" src="https://code.jquery.com/jquery-2.2.4.min.js"></script>
<script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.6.0/katex.min.js"></script>
<script type="text/javascript" src="http://doughanley.com/elltwo/static/js/elltwo.js"></script>

<script type="text/javascript">
elltwo.init();
</script>

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

html_renderer = mistwo.HtmlRenderer()
parse_html = mistwo.Markdown(renderer=html_renderer, escape=True)
def convert_html(s):
    return html_template % parse_html(s)

latex_renderer = mistwo.LatexRenderer()
parse_latex = mistwo.Markdown(renderer=latex_renderer, escape=True)
def convert_latex(s):
    return latex_template % parse_latex(s)

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
    else:
        raise('Unrecognized output format')

    if fname_out is not None:
        with open(fname_out, 'w+') as fout:
            fout.write(outp)
    else:
        print(outp)
