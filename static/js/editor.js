/*
*  Elltwo editor
*/

// begin module
var editor = (function() {

// find outer box
var body = $("body");
var content = $("#elltwo");

// hard coded options
var scrollSpeed = 100;
var scrollFudge = 100;
var canary_freq = 5000;

// globals
var ws;
var active;
var clipboard = [];

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
    return html.replace(/\n/g, "<br>")
               .replace(/  /g, "&nbsp; ");
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

// cell level selection
function select_cell(cell, clear) {
    if (clear) {
        $(".cell.select").removeClass("select");
    }
    cell.addClass("select");
}

// active cell manipulation
function activate_cell(cell) {
    // change css to new
    if (active) {
        active.removeClass("active");
    }
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

// create cell
function insert_cell(cell, edit) {
    // generate id and stitch into linked list
    var newid = Math.max.apply(null, $(".cell").map(function() { return $(this).attr("cid"); }).toArray()) + 1;
    var prev = cell.attr("cid");
    var next = cell.attr("next");
    var cnext = $(".cell[cid="+next+"]");
    cnext.attr("prev", newid);
    cell.attr("next", newid);

    // generate html
    var outer = create_cell("", newid, prev, next);
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

// make ui for cell
function create_cell(text, cid, prev, next) {
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
            select_cell(outer, !event.ctrlKey);
        }
    });

    return outer;
}

// delete cell
function delete_cell(cell, defer) {
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
    if (!defer) {
        full_update();
    }

    // inform server
    var cid = cell.attr("cid");
    var msg = JSON.stringify({"cmd": "delete", "content": {"cid": cid, "prev": prev, "next": next}});
    console.log(msg);
    ws.send(msg);

    // mark document modified
    body.addClass("modified");
}

// cell cut/copy/paste
function copy_selection() {
    clipboard = [];
    var sel = $(".cell.select");
    sel.each(function() {
        var c = $(this);
        var text = c.attr("base-text");
        clipboard.push(text);
    });
    return sel;
}

function cut_selection() {
    // copy source text
    var sel = copy_selection();

    // find next active cell
    var succ = sel.last().next(".cell");
    if (succ.length == 0) {
        succ = sel.first().prev(".cell");
    }

    // remove content
    sel.each(function() {
        var c = $(this);
        delete_cell(c, true);
    });

    // update references
    full_update();

    // choose active
    activate_cell(succ);
    select_cell(succ, true);
}

function paste_clipboard() {
    if (clipboard.length == 0) {
        return;
    }
    var prev = active;
    for (i in clipboard) {
        var text = clipboard[i];
        var outer = insert_cell(prev, false);
        outer.attr("base-text", text);
        render_cell(outer);
        save_cell(outer);
        prev = outer;
    }
    select_cell(active, true);
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
    select_cell(outer, true);
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

// send to the server for storage
function save_document() {
    var msg = JSON.stringify({"cmd": "write", "content": ""});
    console.log(msg);
    ws.send(msg);
    body.removeClass("modified");
}

// for deferred updating
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
    if (marquee.length > 0) {
        var span = $("<span>", {class: "latex"});
        katex.render("\\ell^2", span[0], {throwOnError: false});
        marquee.append(span);
    }
    marquee.click(function() {
        help.slideToggle("fast");
    });

    // topbar button handlers
    var expo_button = $("#topbar-export");
    var expo_slide = $("#topbar-slide");
    var toggle_expo = function() {
        expo_slide.slideToggle("fast");
        expo_button.toggleClass("expanded");
    }

    expo_button.click(function() {
        toggle_expo();
    });

    $("#topbar-markdown").click(function() {
        var md = elltwo.generate_markdown();
        var msg = JSON.stringify({"cmd": "export", "content": {"format": "md", "data": md}});
        ws.send(msg);
        toggle_expo();
    });

    $("#topbar-mdplus").click(function() {
        var md = elltwo.generate_mdplus();
        var msg = JSON.stringify({"cmd": "export", "content": {"format": "mdplus", "data": md}});
        ws.send(msg);
        toggle_expo();
    });

    $("#topbar-html").click(function() {
        var html = elltwo.generate_html();
        var msg = JSON.stringify({"cmd": "export", "content": {"format": "html", "data": html}});
        ws.send(msg);
        toggle_expo();
    });

    $("#topbar-latex").click(function() {
        var latex = elltwo.generate_latex();
        var msg = JSON.stringify({"cmd": "export", "content": {"format": "latex", "data": latex}});
        ws.send(msg);
        toggle_expo();
    });

    $("#topbar-pdf").click(function() {
        var latex = elltwo.generate_latex();
        var msg = JSON.stringify({"cmd": "export", "content": {"format": "pdf", "data": latex}});
        ws.send(msg);
        toggle_expo();
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
                    var newEdit = is_editing(active);
                    if (newEdit) {
                        set_caret_at_end(active);
                    }
                    select_cell(active, !event.shiftKey || actEdit || newEdit);
                    return false;
                } else {
                    select_cell(active, !event.shiftKey);
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
                    var newEdit = is_editing(active);
                    if (newEdit) {
                        set_caret_at_beg(active);
                    }
                    select_cell(active, !event.shiftKey || actEdit || newEdit);
                    return false;
                } else {
                    select_cell(active, !event.shiftKey);
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
                    insert_cell(active, true);
                    return false;
                }
            } else if (keyCode == 13) { // return
                if (actEdit) {
                    if (event.shiftKey) {
                        freeze_cell(active);
                        insert_cell(active, true);
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
                    cut_selection();
                    if (is_editing(active)) {
                        set_caret_at_end(active);
                    }
                }
            } else if (keyCode == 67) { // c
                if (event.shiftKey && !is_editing(active)) {
                    copy_selection();
                }
            } else if (keyCode == 80) { // p
                if (event.shiftKey && !is_editing(active)) {
                    paste_clipboard();
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
function keep_alive() {
    // console.log("heartbeet");
    if (ws.readyState == ws.CLOSED) {
        $("#canary").text("connecting");
        delete(ws);
        connect(false);
    }
    timeoutID = window.setTimeout(keep_alive, [canary_freq]);
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
            timeoutID = window.setTimeout(keep_alive, [canary_freq]);
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
                        var outer = create_cell(c["body"], c["cid"], c["prev"], c["next"]);
                        content.append(outer);
                        render_cell(outer, true);
                    }
                    full_update();
                    var first = content.children(".cell").first();
                    activate_cell(first);
                    select_cell(first, true);
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
