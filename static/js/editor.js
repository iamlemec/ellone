/*
*  Elltwo editor
*/

// begin module
var editor = (function() {

// comms
var send_command;

// find outer box
var bounds;
var content;

// hard coded options
var scrollSpeed = 100;
var scrollFudge = 100;

// globals
var active;
var clipboard = [];
var opened = false;

// utils
function max(arr) {
    return Math.max.apply(null, arr);
};

function min(arr) {
    return Math.min.apply(null, arr);
};

function get_ids(cells) {
    return cells.map(function() {
        return $(this).attr("cid");
    }).toArray();
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
    inner.focus();
    inner.setSelectionRange(0, 0);
}

function set_caret_at_end(outer) {
    var inner = get_inner(outer);
    var len = inner.value.length;
    inner.focus();
    inner.setSelectionRange(len, len);
}

function get_caret_at_beg(outer) {
    var inner = get_inner(outer);
    var cpos = inner.selectionStart;
    return (cpos == 0);
}

function get_caret_at_end(outer) {
    var inner = get_inner(outer);
    var cpos = inner.selectionStart;
    var tlen = inner.value.length;
    return (cpos == tlen);
}

function get_cell_empty(outer) {
    var inner = get_inner(outer);
    var tlen = inner.value.length;
    return (tlen == 0);
}

function autoresize(el) {
    function resize() {
        el.rows = 1;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight+'px';
    }
    /* 0-timeout to get the already changed text */
    function delayedResize() {
        window.setTimeout(resize, 0);
    }
    el.addEventListener('input', resize, false);
    el.addEventListener('cut', delayedResize, false);
    el.addEventListener('paste', delayedResize, false);
    el.addEventListener('drop', delayedResize, false);
    el.addEventListener('keydown', delayedResize, false);
    delayedResize();
}

// cell level selection
function select_cell(cell, clear) {
    if (clear) {
        content.find(".cell.select").removeClass("select");
    }
    cell.addClass("select");
}

// scroll cell into view
function ensure_visible(cell) {
    var scroll = content.scrollTop();
    var height = content.height();

    var cell_top = scroll + cell.position().top;
    var cell_bot = cell_top + cell.height();

    var page_top = scroll;
    var page_bot = page_top + height;

    if (cell_top < page_top + scrollFudge) {
        content.stop();
        content.animate({scrollTop: cell_top - scrollFudge}, scrollSpeed);
    } else if (cell_bot > page_bot - scrollFudge) {
        content.stop();
        content.animate({scrollTop: cell_bot - height + scrollFudge}, scrollSpeed);
    }
}

// active cell manipulation
function activate_cell(cell) {
    // change css to new
    if (active) {
        active.removeClass("active");
    }
    cell.addClass("active");

    // scroll view
    ensure_visible(cell);

    // change focus
    cell.focus();

    // update cell var
    active = cell;
}

function activate_prev(cell) {
    var prev = (cell || active).prev(".cell");
    if (prev.length > 0) {
        activate_cell(prev);
        return true;
    } else {
        return false;
    }
}

function activate_next(cell) {
    var next = (cell || active).next(".cell");
    if (next.length > 0) {
        activate_cell(next);
        return true;
    } else {
        return false;
    }
}

// create cell
function insert_cell(cell, edit, after) {
    // generate id and stitch into linked list
    var newid = max(get_ids(content.find(".cell"))) + 1;
    var prev = cell.attr("cid");
    var next = cell.attr("next");
    var cnext = content.find(".cell[cid="+next+"]");
    cnext.attr("prev", newid);
    cell.attr("next", newid);

    // generate html
    var outer = create_cell("", newid, prev, next);
    if (after) {
        outer.insertAfter(cell);
    } else {
        outer.insertBefore(cell);
    }

    // activate cell
    activate_cell(outer);

    // set up if editing
    if (edit) {
        unfreeze_cell(outer);
    }

    // notify server
    send_command("create", {"newid": newid, "prev": prev, "next": next});

    // mark document modified
    bounds.addClass("modified");

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
        if (is_editing(bounds)) {
            activate_cell(outer);
            select_cell(outer, true);
        }
    });

    return outer;
}

// delete cell
function delete_cell(cell, defer) {
    // snip out of linked list
    prev = cell.attr("prev");
    next = cell.attr("next");
    cprev = content.find(".cell[cid="+prev+"]");
    cnext = content.find(".cell[cid="+next+"]");
    cprev.attr("next", next);
    cnext.attr("prev", prev);

    // delete from DOM
    cell.remove();

    // update globals
    if (!defer) {
        elltwo.full_update();
    }

    // inform server
    var cid = cell.attr("cid");
    send_command("delete", {"cid": cid, "prev": prev, "next": next});

    // mark document modified
    bounds.addClass("modified");
}

// cell cut/copy/paste
function copy_selection() {
    clipboard = [];
    var sel = content.find(".cell.select");
    sel.each(function() {
        var c = $(this);
        var text = c.attr("base-text");
        clipboard.push(text);
    });
    return sel;
}

function cut_selection(copy) {
    // copy source text
    var sel;
    if (copy) {
        sel = copy_selection();
    } else {
        sel = content.find(".cell.select");
    }

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
    elltwo.full_update();

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
        var outer = insert_cell(prev, false, true);
        outer.attr("base-text", text);
        render_cell(outer);
        save_cell(outer);
        prev = outer;
    }
    select_cell(active, true);
}

// wrapper for cell rendering
function render_cell(outer, defer) {
    // parse markdown
    var text = outer.attr("base-text");
    var html = marktwo.parse(text);

    // insert intermediate
    var box = $(html);
    outer.empty();
    outer.append(box);

    // elltwo render
    elltwo.apply_render(box, defer);

    // post-render
    box.find("a.internal").each(function() {
        var link = $(this);
        var href = link.attr("href");
        link.removeClass("internal");
        link.addClass("card");
        send_command("card", {"link": href});
    });
}

// go into static mode
function freeze_cell(outer) {
    clear_selection();
    var inner = get_inner(outer, true);
    var text = inner.val();
    outer.attr("base-text", text);
    outer.removeClass("editing");
    render_cell(outer);
    if (outer.hasClass("modified")) {
        save_cell(outer);
    }
}

// start editing cell
function unfreeze_cell(outer) {
    var text = outer.attr("base-text");
    var inner = $("<textarea>");
    inner.val(text);
    autoresize(inner[0]);
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
    send_command("save", {"cid": cid, "body": text});

    // mark document as modified (cell not so)
    bounds.addClass("modified");
    cell.removeClass("modified");
}

// send to the server for storage
function save_document() {
    console.log("saving document");
    send_command("write");
    bounds.removeClass("modified");
}

// initialization code
function connect_handlers() {
    // topbar button handlers
    var expo_button = bounds.find("#topbar-export");
    var expo_slide = bounds.find("#topbar-slide");
    var toggle_expo = function() {
        expo_slide.slideToggle("fast");
        expo_button.toggleClass("expanded");
    }

    expo_button.click(function() {
        toggle_expo();
    });

    bounds.find("#topbar-markdown").click(function() {
        var md = elltwo.generate_export('md');
        send_command("export", {"format": "md", "data": md});
        toggle_expo();
    });

    bounds.find("#topbar-mdplus").click(function() {
        var mdplus = elltwo.generate_export('mdplus');
        send_command("export", {"format": "mdplus", "data": mdplus});
        toggle_expo();
    });

    bounds.find("#topbar-html").click(function() {
        var html = elltwo.generate_export('html');
        send_command("export", {"format": "html", "data": html});
        toggle_expo();
    });

    bounds.find("#topbar-latex").click(function() {
        var latex = elltwo.generate_export('latex');
        send_command("export", {"format": "latex", "data": latex["out"]});
        toggle_expo();
    });

    bounds.find("#topbar-pdf").click(function() {
        var latex = elltwo.generate_export('latex');
        send_command("export", {"format": "pdf", "data": latex["out"], "deps": latex["deps"]});
        toggle_expo();
    });

    bounds.find("#topbar-save").click(function() {
        save_document();
    });

    bounds.find("#topbar-revert").click(function() {
        send_command("revert");
        bounds.removeClass("modified");
    });

    bounds.find("#topbar-reload").click(function() {
        send_command("fetch");
    });

    bounds.find("#topbar-editing").click(function() {
        if (!bounds.hasClass("locked")) {
            bounds.toggleClass("editing");
        }
    });

    // vim-like controls :)
    bounds.keydown(function(event) {
        // console.log(event.keyCode);

        var keyCode = event.keyCode;
        var docEdit = is_editing(bounds);
        var actEdit = (active != undefined) && is_editing(active);

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
            } else if ((keyCode == 79) || (keyCode == 66)) { // o or b
                if (!actEdit) {
                    insert_cell(active, true, true);
                    return false;
                }
            } else if (keyCode == 65) { // a
                if (!actEdit) {
                    insert_cell(active, true, false);
                    return false;
                }
            } else if (keyCode == 13) { // return
                if (actEdit) {
                    if (event.shiftKey) {
                        freeze_cell(active);
                        insert_cell(active, true, true);
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
                if (!$(event.target).is("textarea")) {
                    event.preventDefault();
                }
            } else if ((keyCode == 88) || (keyCode == 68)) { // x or d
                if (event.shiftKey && !is_editing(active)) {
                    var copy = (keyCode == 88);
                    cut_selection(copy);
                    if (is_editing(active)) {
                        set_caret_at_end(active);
                    }
                }
            } else if (keyCode == 67) { // c
                if (event.shiftKey && !is_editing(active)) {
                    copy_selection();
                }
            } else if (keyCode == 86) { // v
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

function scaffold(targ) {
    // whitebar
    var whitebar = $("<div/>", {id: "whitebar"});
    var marquee = $("<span/>", {id: "marquee"});
    var canary = $("<span/>", {id: "canary"});

    // marquee
    var logo = $("<span>", {class: "latex"});
    katex.render("\\ell^2", logo[0], {throwOnError: false});
    marquee.append(logo);

    // topbar controls
    var topbar_control = $("<div/>", {id: "topbar-control"});
    topbar_control.append($("<span/>", {id: "topbar-save", class: "topbar-button", text: "Save"}));
    topbar_control.append($("<span/>", {id: "topbar-revert", class: "topbar-button", text: "Revert"}));
    topbar_control.append($("<span/>", {id: "topbar-reload", class: "topbar-button", text: "Reload"}));
    topbar_control.append($("<span/>", {id: "topbar-editing", class: "topbar-button", text: "Editing"}));
    topbar_control.append($("<span/>", {id: "topbar-export", class: "topbar-button", text: "Export"}));

    // export popdown
    var topbar_slide = $("<div/>", {id: "topbar-slide"});
    topbar_slide.append($("<span/>", {id: "topbar-markdown", class: "topbar-button topbar-dropdown", text: ".md"}));
    topbar_slide.append($("<span/>", {id: "topbar-mdplus", class: "topbar-button topbar-dropdown", text: ".md+"}));
    topbar_slide.append($("<span/>", {id: "topbar-html", class: "topbar-button topbar-dropdown", text: ".html"}));
    topbar_slide.append($("<span/>", {id: "topbar-latex", class: "topbar-button topbar-dropdown", text: ".tex"}));
    topbar_slide.append($("<span/>", {id: "topbar-pdf", class: "topbar-button topbar-dropdown", text: ".pdf"}));

    // topbar buttons
    var topbar = $("<div/>", {id: "topbar"});
    topbar.append(marquee);
    topbar.append(canary);
    topbar.append(topbar_control);
    topbar.append(topbar_slide);

    // content box
    content = $("<div/>", {id: "elltwo"});

    // all together
    bounds = $("<div/>", {id: "bounds", tabindex: 0});
    bounds.append(topbar);
    bounds.append(content);

    // final
    targ.append(bounds);
}

// incoming commands - fetch, readonly, serve, card
function recv_command(cmd, cont) {
    if ((cmd == "fetch") || (cmd == "readonly")) {
        content.empty();
        for (i in cont) {
            var c = cont[i];
            var outer = create_cell(c["body"], c["cid"], c["prev"], c["next"]);
            content.append(outer);
            render_cell(outer, true);
        }
        elltwo.full_update();
        var first = content.children(".cell").first();
        activate_cell(first);
        select_cell(first, true);
        if (cmd == "fetch") {
            bounds.addClass("editing");
        } else {
            bounds.addClass("locked");
        }
    } else if (cmd == "serve") {
        window.location.replace("/__export/"+cont);
    } else if (cmd == "card") {
        var href = cont["link"];
        var title = cont["title"];
        var prev = cont["preview"];
        content.find("a.card").each(function() {
            var link = $(this);
            if (link.attr("href") == href) {
                if (title.length > 0) {
                    link.text(title);
                    link.removeClass("card");
                }
            }
        });
    } else if (cmd == "canary") {
        bounds.find("#canary").text("connecting");
    }
}

function init(targ, config, callback) {
    console.log(config);

    send_command = callback;

    // create ui
    scaffold(targ);
    connect_handlers();

    // initialize elltwo manually
    elltwo.update_config(config);
    elltwo.set_content(content);

    // focus editor
    bounds.focus();
}

// public interface
return {
    init: init,
    recv_command: recv_command
}

// end module
})();
