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

function escape_html(text) {
    return text.replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/&/g, "&amp;")
               .replace(/  /g, " &nbsp;");
};

function unescape_html(text) {
    return text.replace(/&lt;/g, "<")
               .replace(/&gt;/g, ">")
               .replace(/&amp;/g, "&")
               .replace(/&nbsp;/g, " ");
};

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
    if (cell.hasClass("modified")) {
        body.addClass("modified");
        cell.removeClass("modified");
    }
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
    var outer = make_para("", newid, prev, next, edit);
    outer.insertAfter(cell);

    // activate cell
    activate_cell(outer);

    // place caret inside if editing
    if (edit) {
        set_caret_at_end(outer);
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
    var base = unescape_html(text);
    outer.attr("base-text", base);
    outer.removeClass("editing");
    save_cell(outer);
}

// start editing cell
function unfreeze_cell(outer) {
    var base = outer.attr("base-text");
    var text = escape_html(base);
    var html = add_tags(text);
    var inner = $("<div>", {html: html, contentEditable: true});
    outer.addClass("editing");
    outer.empty();
    outer.append(inner);
    outer.bind("input", function() {
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
function make_para(text, cid, prev, next, edit) {
    edit = edit || false;

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

    // start out editing?
    if (edit) {
        outer.addClass("editing");
        var inner = $("<div>", {contentEditable: "true"});
        outer.append(inner);
    }

    return outer;
}

// wrapper for cell rendering
function render_cell(cid, html, defer) {
    var outer = $(".cell[cid=" + cid + "]");
    var box = $(html);
    outer.empty();
    outer.append(box);
    elltwo.apply_render(box, defer);
}

function full_update() {
    console.log("rendering");
    elltwo.number_sections();
    elltwo.number_equations();
    elltwo.number_footnotes();
    elltwo.resolve_references();
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
        window.location.replace("/markdown/"+path);
    });

    $("#topbar-html").click(function() {
        window.location.replace("/html/"+path);
    });

    $("#topbar-latex").click(function() {
        window.location.replace("/latex/"+path);
    });

    $("#topbar-pdf").click(function() {
        window.location.replace("/pdf/"+path);
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
function connect(query)
{
    if ("MozWebSocket" in window) {
        WebSocket = MozWebSocket;
    }
    if ("WebSocket" in window) {
        var ws_con = "ws://" + window.location.host + "/elledit/" + path;
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
                        render_cell(c["cid"], c["html"], true);
                    }
                    full_update();
                    active = content.children(".cell").first();
                    active.addClass("active");
                } else if (cmd == "render") {
                    var cont = json_data["content"];
                    render_cell(cont["cid"], cont["html"], cont["defer"]);
                }
            }
        };
    } else {
        console.log("Sorry, your browser does not support websockets.");
    }
}

function disconnect()
{
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
