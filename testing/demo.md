#! Sample $\ell^2$ Document

This is an example of a document written using the $\ell^2$ (ell-two) typesetting system. Basic elements of markdown syntax are supported, as are certain extensions geared toward academic writing.

# Commands

Here is a list of the keyboard common keyboard commands:

- `up/down`: move active cell
- `w`: edit active cell
- `o`: create new cell after active (and edit)
- `esc`: render cell contents
- `shift+enter`: render cell and create new one (= `esc` then `o`)
- `D`: delete cell
- `ctrl+s`: save document

As in the above, unordered lists can be created with consecutive lines in a cell starting with `-`, while ordered lists use `+`. Click on the logo in the top left for a command cheat sheet.

# Cell Directives

Text cells can be typed in verbatim. Create heading cells by prefacing them with any appropriate number of `#`'s. Image cells must be separate but otherwise use the same syntax as regular markdown: `!\[url\]\(caption\)`

![Jahnke_gamma_function.png](Ye Olde Gamma Function)

Clicking on a cell, makes it the active cell. One can also move to the previous or next cell with the arrow keys. Creation and deletion of cells can also be accomplished with the mouse hover buttons.

# Math

Math is rendered using KaTeX and supports much of TeX style syntax. It can be displayed inline, as in $x \in \{1,2,\ldots\}$ or in display style

$$ [eq1] \int_0^{\infty} \exp(-x^2)\ dx = \frac{\sqrt{\pi}}{2}$$

This makes debugging equation errors considerably easier. On top of that, KaTeX now even supports subexpression error display

$$x^2 = \frac{y^2 + \sqrt{\elm^3}}{2}$$

Equations can be numbered with semi-arbitrary labels as in `\[eq1\]`, and referenced similarly with `\@\[eq1\]`, for example @[eq1]. There will be a hover preview of the contents of the referenced equation.

# Exporting

Documents can be exported to a variety of formats:

+ Markdown (ish): simply the concatenation of all cell inputs
+ HTML: an intermediate language that allows for portable viewing, although + uses external javascript libraries
+ LaTeX: naturally we cannot capture all the richness of latex in this environment, but it's a start
+ PDF: auto-compiled version of the previous.
