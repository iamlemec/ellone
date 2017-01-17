/*
*  Elltwo editor
*/

// begin module
var editor = (function() {

// find outer box
var body = $("body");
var content = $("#elltwo");

// globals
var ws;

// utils
function max(arr) {
    return Math.max.apply(null, arr);
};

function min(arr) {
    return Math.min.apply(null, arr);
};

// escaping
function strip_tags(html) {
    if (html.startsWith("<div>")) {
        html = html.replace(/<div>/, "");
    }
    return html.replace(/<div ?.*?>/g, "\n")
               .replace(/<\/div>/g, "")
               .replace(/<br>/g, "\n")
               .replace(/\n+/g, "\n")
               .replace(/<span ?.*?>/g, "")
               .replace(/<\/span>/g, "");
};

function add_tags(html) {
    return html.replace(/\n/g, "<br>");
}

// cell utils
function get_inner(outer, jq) {
    var inner = outer.children().first();
    if (!jq) {
        inner = inner[0];
    }
    return inner;
}

function is_editing(outer) {
    return outer.hasClass("editing");
}

// selection and cursor/caret utilities
function clear_selection() {
    var sel = window.getSelection();
    sel.removeAllRanges();
}

function set_caret_at_beg(outer) {
    var inner = get_inner(outer);
    var range = document.createRange();
    range.setStart(inner, 0);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    inner.focus();
}

function set_caret_at_end(outer) {
    var inner = get_inner(outer);
    var range = document.createRange();
    range.selectNodeContents(inner);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    inner.focus();
}

function get_caret_position(inner) {
    sel = window.getSelection();
    if (sel.rangeCount > 0) {
        var range = window.getSelection().getRangeAt(0);
        var preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(inner);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        caretOffset = preCaretRange.toString().length;
    }
    return caretOffset;
}

function get_caret_at_beg(outer) {
    var inner = get_inner(outer);
    var cpos = get_caret_position(inner);
    return (cpos == 0);
}

function get_cell_empty(outer) {
    var inner = get_inner(outer);
    var tlen = inner.textContent.length;
    return (tlen == 0);
}

function get_caret_at_end(outer) {
    var inner = get_inner(outer);
    var cpos = get_caret_position(inner);
    var tlen = inner.textContent.length;
    return (cpos == tlen);
}

// active cell manipulation
var scrollSpeed = 300;
var scrollFudge = 100;
var active;

function activate_cell(cell) {
    // change css to new
    active.removeClass("active");
    cell.addClass("active");

    // scroll cell into view
    var cell_top = cell.offset().top;
    var cell_bot = cell_top + cell.height();
    var page_top = window.scrollY;
    var page_bot = page_top + window.innerHeight;
    if (cell_top < page_top) {
        body.stop();
        body.animate({scrollTop: cell_top - scrollFudge}, scrollSpeed);
    } else if (cell_bot > page_bot) {
        body.stop();
        body.animate({scrollTop: cell_bot - window.innerHeight + scrollFudge}, scrollSpeed);
    }

    // change focus
    cell.focus();

    // update cell var
    active = cell;
}

function activate_prev() {
    var prev = active.prev(".cell");
    if (prev.length > 0) {
        activate_cell(prev);
        return true;
    } else {
        return false;
    }
}

function activate_next() {
    var next = active.next(".cell");
    if (next.length > 0) {
        activate_cell(next);
        return true;
    } else {
        return false;
    }
}

// save cell to server
function save_cell(cell) {
    // get source text
    var cid = cell.attr("cid");
    var text = cell.attr("base-text");

    // send to server
    var msg = JSON.stringify({"cmd": "save", "content": {"cid": cid, "body": text}});
    console.log(msg);
    ws.send(msg);

    // mark document as modified (cell not so)
    body.addClass("modified");
    cell.removeClass("modified");
}

// create cell
function create_cell(cell, edit) {
    // generate id and stitch into linked list
    var newid = Math.max.apply(null, $(".cell").map(function() { return $(this).attr("cid"); }).toArray()) + 1;
    var prev = cell.attr("cid");
    var next = cell.attr("next");
    var cnext = $(".cell[cid="+next+"]");
    cnext.attr("prev", newid);
    cell.attr("next", newid);

    // generate html
    var outer = make_para("", newid, prev, next);
    outer.insertAfter(cell);

    // activate cell
    activate_cell(outer);

    // set up if editing
    if (edit) {
        unfreeze_cell(outer);
    }

    // notify server
    var msg = JSON.stringify({"cmd": "create", "content": {"newid": newid, "prev": prev, "next": next}});
    console.log(msg);
    ws.send(msg);

    // mark document modified
    body.addClass("modified");

    // return created cell
    return outer;
}

// delete cell
function delete_cell(cell) {
    var inner = get_inner(cell, true);
    var is_section = inner.hasClass("sec-title");
    var is_equation = inner.hasClass("equation");
    var has_footnote = (inner.find("footnote").length == 0);

    // snip out of linked list
    prev = cell.attr("prev");
    next = cell.attr("next");
    cprev = $(".cell[cid="+prev+"]");
    cnext = $(".cell[cid="+next+"]");
    cprev.attr("next", next);
    cnext.attr("prev", prev);

    // delete from DOM
    cell.remove();

    // update globals
    if (is_section) {
        elltwo.number_sections();
    }
    if (is_equation) {
        elltwo.number_equations();
    }
    if (has_footnote) {
        elltwo.number_footnotes();
    }
    if (is_equation || is_section) {
        elltwo.resolve_references();
    }

    // inform server
    var cid = cell.attr("cid");
    var msg = JSON.stringify({"cmd": "delete", "content": {"cid": cid, "prev": prev, "next": next}});
    console.log(msg);
    ws.send(msg);

    // mark document modified
    body.addClass("modified");
}

clipboard = "";
function copy_cell(cell) {
    clipboard = cell.attr("base-text");
}

function paste_cell(cell) {
    if (clipboard.length == 0) {
        return;
    }
    var outer = create_cell(cell, false);
    outer.attr("base-text", clipboard);
    save_cell(outer);
}

// go into static mode
function freeze_cell(outer) {
    clear_selection();
    var inner = get_inner(outer, true);
    var html = inner.html();
    var text = strip_tags(html);
    var base = elltwo.unescape_html(text);
    outer.attr("base-text", base);
    outer.removeClass("editing");
    render_cell(outer);
    if (outer.hasClass("modified")) {
        save_cell(outer);
    }
}

// start editing cell
function unfreeze_cell(outer) {
    var text = outer.attr("base-text");
    var html = add_tags(text);
    var inner = $("<div>", {html: html, contentEditable: true});
    outer.addClass("editing");
    outer.empty();
    outer.append(inner);
    inner.bind("input", function() {
        outer.addClass("modified");
    });
    set_caret_at_end(outer);
}

// send to the server for storage
function save_document() {
    var msg = JSON.stringify({"cmd": "write", "content": ""});
    console.log(msg);
    ws.send(msg);
    body.removeClass("modified");
}

// make paragraph for cell
function make_para(text, cid, prev, next) {
    // insert into list
    var outer = $("<div>", {class: "cell"});
    outer.attr("cid", cid);
    outer.attr("prev", prev);
    outer.attr("next", next);
    outer.attr("base-text", text);

    // event handlers
    outer.click(function(event) {
        if (is_editing(body)) {
            activate_cell(outer);
        }
    });

    return outer;
}

// wrapper for cell rendering
function render_cell(outer, defer) {
    var text = outer.attr("base-text");
    var html = marktwo.parse(text);
    var box = $(html);
    outer.empty();
    outer.append(box);
    elltwo.apply_render(box, defer);
}

// for deferred updating
function full_update() {
    console.log("rendering");
    elltwo.number_sections();
    elltwo.number_equations();
    elltwo.number_footnotes();
    elltwo.resolve_references();
}

// exporting to markdown
function generate_markdown() {
    console.log("getting markdown");
    var md = '';
    content.children().each(function() {
        var outer = $(this);
        md += outer.attr("base-text");
        md += '\n\n';
    });
    return md.trimRight();
}

// exporting to markdown in html
var pre_mdplus = `<!doctype html>
<html>

<head>

<link rel="stylesheet" href="http://doughanley.com/elltwo/static/css/elltwo.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.6.0/katex.min.css">

</head>

<body>

<!-- <span id="marquee"></span> -->

<div id="elltwo" class="markdown">

`;

var post_mdplus = `

</div>

<script type="text/javascript" src="https://code.jquery.com/jquery-2.2.4.min.js"></script>
<script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.6.0/katex.min.js"></script>
<script type="text/javascript" src="http://doughanley.com/elltwo/static/js/marktwo.js"></script>
<script type="text/javascript" src="http://doughanley.com/elltwo/static/js/elltwo.js"></script>

<script type="text/javascript">
elltwo.init();
</script>

</body>

</html>`;

function generate_mdplus() {
    var md = generate_markdown();
    return pre_mdplus + md + post_mdplus;
}

// exporting to html
var pre_html = `<!doctype html>
<html>

<head>

<link rel="stylesheet" href="http://doughanley.com/elltwo/static/css/elltwo.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.6.0/katex.min.css">

</head>

<body>

<!-- <span id="marquee"></span> -->

<div id="elltwo">

`;

var post_html = `

</div>

<script type="text/javascript" src="https://code.jquery.com/jquery-2.2.4.min.js"></script>
<script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.6.0/katex.min.js"></script>
<script type="text/javascript" src="http://doughanley.com/elltwo/static/js/elltwo.js"></script>

<script type="text/javascript">
elltwo.init();
</script>

</body>

</html>`;

// construct html parser
var opts_html = marktwo.merge({}, marktwo.defaults, {'renderer': new marktwo.Renderer});
var lexer_html = new marktwo.Lexer(opts_html);
var parser_html = new marktwo.Parser(opts_html);
function parse_html(src) {
    return parser_html.parse(lexer_html.lex(src));
}

function generate_html() {
    console.log("getting html");
    var md = generate_markdown();
    var html = parse_html(md);
    return pre_html + html.trim() + post_html;
}

// exporting to latex/pdf
var pre_latex = `\\documentclass[12pt]{article}

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

`;

var post_latex = `
\\end{document}`;

// construct latex parser
var opts_latex = marktwo.merge({}, marktwo.defaults, {'renderer': new marktwo.LatexRenderer});
var lexer_latex = new marktwo.Lexer(opts_latex);
var parser_latex = new marktwo.Parser(opts_latex);
function parse_latex(src) {
    return parser_latex.parse(lexer_latex.lex(src));
}

function generate_latex() {
    console.log("getting latex");
    var md = generate_markdown();
    var latex = parse_latex(md);
    return pre_latex + latex.trim() + post_latex;
}

// initialization code
function initialize() {
    // marquee box
    var marquee = $("#marquee");
    var help = $("#help");
    marquee.click(function() {
        help.slideToggle("fast");
    });

    // topbar button handlers
    $("#topbar-export").click(function() {
        $("#topbar-slide").slideToggle("fast");
        $(this).toggleClass("expanded");
    });

    $("#topbar-markdown").click(function() {
        var md = generate_markdown();
        var msg = JSON.stringify({"cmd": "export", "content": {"format": "md", "data": md}});
        ws.send(msg);
    });

    $("#topbar-mdplus").click(function() {
        var md = generate_mdplus();
        var msg = JSON.stringify({"cmd": "export", "content": {"format": "mdplus", "data": md}});
        ws.send(msg);
    });

    $("#topbar-html").click(function() {
        var html = generate_html();
        var msg = JSON.stringify({"cmd": "export", "content": {"format": "html", "data": html}});
        ws.send(msg);
    });

    $("#topbar-latex").click(function() {
        var latex = generate_latex();
        var msg = JSON.stringify({"cmd": "export", "content": {"format": "latex", "data": latex}});
        ws.send(msg);
    });

    $("#topbar-pdf").click(function() {
        var latex = generate_latex();
        var msg = JSON.stringify({"cmd": "export", "content": {"format": "pdf", "data": latex}});
        ws.send(msg);
    });

    $("#topbar-save").click(function() {
        save_document();
    });

    $("#topbar-revert").click(function() {
        var msg = JSON.stringify({"cmd": "revert", "content": ""});
        console.log(msg);
        ws.send(msg);
        body.removeClass("modified");
    });

    $("#topbar-reload").click(function() {
        var msg = JSON.stringify({"cmd": "fetch", "content": ""});
        ws.send(msg);
    });

    $("#topbar-editing").click(function() {
        body.toggleClass("editing");
    });

    // vim-like controls :)
    $(window).keydown(function(event) {
        // console.log(event.keyCode);

        var keyCode = event.keyCode;
        var docEdit = is_editing(body);
        var actEdit = is_editing(active);

        if (docEdit) {
            if (keyCode == 38) { // up
                if (actEdit) {
                    if (!get_caret_at_beg(active)) {
                        return true;
                    }
                }
                if (activate_prev()) {
                    if (actEdit) {
                        clear_selection();
                    }
                    if (is_editing(active)) {
                        set_caret_at_end(active);
                    }
                    return false;
                }
            } else if (keyCode == 40) { // down
                if (actEdit) {
                    if (!get_caret_at_end(active)) {
                        return true;
                    }
                }
                if (activate_next()) {
                    if (actEdit) {
                        clear_selection();
                    }
                    if (is_editing(active)) {
                        set_caret_at_beg(active);
                    }
                    return false;
                }
            } else if (keyCode == 87) { // w
                if (!actEdit) {
                    unfreeze_cell(active);
                    return false;
                }
            } else if (keyCode == 27) { // escape
                if (actEdit) {
                    freeze_cell(active);
                    return false;
                }
            } else if (keyCode == 79) { // o
                if (!actEdit) {
                    create_cell(active, true);
                    return false;
                }
            } else if (keyCode == 13) { // return
                if (actEdit) {
                    if (event.shiftKey) {
                        freeze_cell(active);
                        create_cell(active, true);
                        return false;
                    }
                }
            } else if (keyCode == 8) { // backspace
                if (actEdit) {
                    var outer = active;
                    if (get_cell_empty(active)) {
                        if (activate_prev()) {
                            delete_cell(outer);
                            if (is_editing(active)) {
                                set_caret_at_end(active);
                            }
                        }
                        return false;
                    }
                }
                if (!$(event.target).attr("contentEditable")) {
                    event.preventDefault();
                }
            } else if (keyCode == 68) { // d
                if (event.shiftKey && !is_editing(active)) {
                    outer = active;
                    if (!activate_next()) {
                        activate_prev();
                    }
                    copy_cell(outer);
                    delete_cell(outer);
                    if (is_editing(active)) {
                        set_caret_at_end(active);
                    }
                }
            } else if (keyCode == 67) { // c
                if (event.shiftKey && !is_editing(active)) {
                    copy_cell(active);
                }
            } else if (keyCode == 80) { // p
                if (event.shiftKey && !is_editing(active)) {
                    paste_cell(active);
                }
            } else if (keyCode == 83) { // s
                if (event.ctrlKey || event.metaKey) {
                    save_document();
                    return false;
                }
            }
        } else {
            // nothing to do in document frozen mode
        }
    });
}

// keep alive magic
freq = 5000;
function keep_alive() {
    // console.log("heartbeet");
    if (ws.readyState == ws.CLOSED) {
        $("#canary").text("connecting");
        delete(ws);
        connect(false);
    }
    timeoutID = window.setTimeout(keep_alive, [freq]);
}

// websockets
function connect(query) {
    if ("MozWebSocket" in window) {
        WebSocket = MozWebSocket;
    }
    if ("WebSocket" in window) {
        var ws_con = "ws://" + window.location.host + "/__elledit/" + path;
        // console.log(ws_con);

        ws = new WebSocket(ws_con);

        ws.onopen = function() {
            console.log("websocket connected!");
            $("#canary").text("connected");
            if (query) {
                var msg = JSON.stringify({"cmd": "fetch", "content": ""});
                ws.send(msg);
            }
            timeoutID = window.setTimeout(keep_alive, [freq]);
        };

        ws.onmessage = function (evt) {
            var msg = evt.data;
            // console.log("Received: " + msg);

            var json_data = JSON.parse(msg);
            if (json_data) {
                var cmd = json_data["cmd"];
                var cont = json_data["content"];
                if (cmd == "fetch") {
                    var cells = json_data["content"];
                    content.empty();
                    for (i in cells) {
                        var c = cells[i];
                        var outer = make_para(c["text"], c["cid"], c["prev"], c["next"]);
                        content.append(outer);
                        render_cell(outer, true);
                    }
                    full_update();
                    active = content.children(".cell").first();
                    active.addClass("active");
                } else if (cmd == "serve") {
                    window.location.replace("/__export/"+cont);
                }
            }
        };
    } else {
        console.log("Sorry, your browser does not support websockets.");
    }
}

function disconnect() {
    if (ws) {
        ws.close();
    }
}

// public interface
return {
    init: function() {
        console.log(path);

        // run
        initialize();
        connect(true);
    }
}

// end module
})();
