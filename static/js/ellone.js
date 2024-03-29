/*
 * Ellone Module
 */

var ellone = (function() {

// find outer box
var content;

/*
 * configuration
 */

var defaults = {
    markdown: false,
    render: true,
    macros: {},
    reference: function(authors, year) {
        var reftext = authors;
        if (year != undefined) {
            reftext += " (" + year + ")";
        }
        return reftext;
    },
    seclabel: function(sec_num, lvl) {
        return sec_num.slice(0, lvl).join(".");
    }
};
var config = defaults;

function merge(obj) {
    var i = 1;
    var target;
    var key;

    for (; i < arguments.length; i++) {
      target = arguments[i];
      for (key in target) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          obj[key] = target[key];
        }
      }
    }

    return obj;
}

/*
 * rendering commands
 */

function escape_html(text) {
    return text.replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/&/g, "&amp;")
               .replace(/  /g, " &nbsp;");
}

function unescape_html(text) {
    return text.replace(/&lt;/g, "<")
               .replace(/&gt;/g, ">")
               .replace(/&amp;/g, "&")
               .replace(/&nbsp;/g, " ")
               .replace(/&#39;/g, "'");
}

function oxford(clist) {
    var out = "";
    var ncl = clist.length;
    for (i in clist) {
        c = clist[i];
        if (i == 0) {
            out += c;
        } else if (i == ncl - 1) {
            if (ncl > 2) {
                out += ",";
            }
            out += " and " + c;
        } else {
            out += ", " + c;
        }
    }
    return out;
}

// rendering
function apply_render(box, defer) {
    var new_section = false;
    var new_equation = false;
    var new_footnote = false;
    var new_reference = false;
    var new_figure = false;
    var new_table = false;
    var new_biblio = false;

    // handle sections
    if (box.is("title")) {
        var div = $("<div>", {class: "doc-title", html: box.text()});
        box.replaceWith(div);
        box = div;
    }

    var tag = box.prop("tagName");
    if (/H[1-6]/.test(tag)) {
        new_section = true;
        box.addClass("sec-title");
        var lvl = parseInt(tag[1]);
        box.addClass("sec-lvl-"+lvl);
        box.attr("sec-lvl",lvl);
    }

    // handle images
    box.find("img").each(function() {
        var img = $(this);
        var src = img.attr("src");
        img.attr("src", src);
    });

    // handle footnotes
    box.find(".footnote").each(function() {
        new_footnote = true;
        var fnote = $(this);
        var cont = fnote.html();
        var num = $("<span>", {class: "number"});
        var popup = $("<div>", {class: "popup footnote-popup", html: cont});
        fnote.empty();
        fnote.append(num);
        attach_popup(fnote, popup);
    });

    // handle inline latex
    box.find(".latex").each(function() {
        var tex = $(this);
        var src = tex.text();
        tex.empty();
        try {
          katex.render(src, tex[0], {macros: config["macros"]});
        } catch (e) {
          console.log(box.text());
          console.log(src);
          console.log(e);
        }
    });

    // handle references
    box.find(".reference").each(function() {
        new_reference = true;
        var ref = $(this);
        var targ = ref.text();
        ref.attr("target", targ);
    });

    // typeset disyplay equations
    if (box.hasClass("equation")) {
        var src = box.text();
        box.empty();

        var num_div = $("<div>", {class: "equation-number"});
        var div_inner = $("<div>", {class: "equation-inner"});

        var tex = "\\begin{aligned}\n" + src + "\n\\end{aligned}";
        try {
            katex.render(tex, div_inner[0], {displayMode: true, macros: config["macros"]});
        } catch (e) {
            var err_div = $("<div>", {class: "math-error"});
            var err_code = $("<pre>", {class: "math-code", text: src});
            var err_msg = $("<div>", {class: "err-msg", text: e.message});
            err_div.append(err_code);
            err_div.append(err_msg);
            div_inner.append(err_div);
            e1 = e;
        }

        if (box.attr("id") != undefined) {
            new_equation = true;
            box.addClass("numbered");
        }

        box.append(num_div);
        box.append(div_inner);
    }

    if (box.is("figure")) {
        if (box.hasClass("image")) {
            new_figure = true;
        }
        if (box.hasClass("table")) {
            new_table = true;
        }
    }

    if (box.hasClass("biblio")) {
        new_biblio = true;

        var id = box.attr("id");
        var inst = box.attr("institution");
        var authors = box.attr("authors");
        var shortname = box.attr("shortname");
        var title = box.attr("title");
        var year = box.attr("year");
        var journal = box.attr("journal");
        var doi = box.attr("doi");
        var url = box.attr("url");
        var note = box.attr("note");

        // parse authors
        var authtext;
        var lasttext;
        if (inst != undefined) {
            authtext = inst;
            lasttext = inst;
        } else {
            var fulllist = authors.split(";");
            var authlist = [];
            var lastlist = [];
            for (i in fulllist) {
                var auth = fulllist[i];
                var names = auth.split(" ");
                var lname = names.pop();
                if (names.length > 0) {
                    fname = lname + ", " + names.join(" ");
                } else {
                    fname = lname;
                }
                if (i == 0) {
                    authlist.push(fname);
                    lastlist.push(lname);
                } else {
                    authlist.push(auth);
                    lastlist.push(lname);
                }
            }
            authtext = oxford(authlist);
            lasttext = oxford(lastlist);
        }

        // construct cite line
        var text = authtext + ". ";
        if (year != undefined) {
            text += year + ". ";
        }
        if (title != undefined) {
            text += "\"" + title + ".\" ";
        }
        if (journal != undefined) {
            text += "<i>" + journal + ".</i> ";
        }
        if (url != undefined) {
            text += "<a href=\"" + url + "\">" + url + "</a>. ";
        }
        if (doi != undefined) {
            text += "DOI: <a href=\"http://doi.org/" + doi + "\">" + doi + "</a>. ";
        }
        if (note != undefined) {
            text += note + ".";
        }

        // construct reference text
        if (shortname != undefined) {
            refname = shortname;
        } else {
            refname = lasttext;
        }
        reftext = config["reference"](refname, year);

        var bref = $("<div>", {class: "biblio", id: id, html: text, reftext: reftext});
        box.replaceWith(bref);
        box = bref;
    }

    // recalculate sections, equations, and references
    if (!defer) {
        if (new_section) {
            number_sections();
        }
        if (new_equation) {
            number_equations();
        }
        if (new_footnote) {
            number_footnotes();
        }
        if (new_figure) {
            number_figures();
        }
        if (new_table) {
            number_tables();
        }
        if (new_section || new_equation || new_figure || new_table || new_biblio) {
            resolve_references();
        } else {
            if (new_reference) {
                resolve_references(box);
            }
        }
    }
}

/*
 * numbering functions
 */

function number_sections() {
    console.log("numbering sections");
    var sec_num = Array();
    sec_num[0] = 0;
    content.find(".sec-title:not(.nonumber)").each(function() {
        var sec = $(this);
        var lvl = parseInt(sec.attr("sec-lvl"));
        sec_num[lvl-1]++;
        sec_num[lvl] = 0;
        var lab = config["seclabel"](sec_num, lvl);
        sec.attr("sec-num", lab);
    });
}

function number_equations() {
    console.log("numbering equations");
    var eqn_num = 1;
    content.find(".equation.numbered").each(function() {
        var eqn = $(this);
        var num = eqn.children(".equation-number");
        eqn.attr("eqn-num", eqn_num);
        num.html(eqn_num);
        eqn_num++;
    });
}

function number_footnotes() {
    console.log("numbering footnotes");
    var n_footnotes = 0;
    content.find(".footnote").each(function () {
        var fnote = $(this);
        var num = fnote.children(".number");
        var foot_num = ++n_footnotes;
        num.text(foot_num);
    });
}

function number_figures() {
  console.log("numbering figures");
  var n_figures = 0;
  content.find("figure.image:not(nonumber)").each(function () {
      var fig = $(this);
      var cap = fig.children("figcaption");
      var fig_num = ++n_figures;
      cap.attr("fig-num", fig_num);
  });
}

function number_tables() {
  console.log("numbering tables");
  var n_tables = 0;
  content.find("figure.table:not(nonumber)").each(function () {
      var tab = $(this);
      var cap = tab.children("figcaption");
      var tab_num = ++n_tables;
      cap.attr("tab-num", tab_num);
  });
}

/*
 * popup functions
 */

// for a hover event and scale factor (of the realized object), generate appropriate css
function get_offset(parent, popup, event) {
    var rects = parent[0].getClientRects();

    var trect;
    var top_rect;
    for (var i in rects) {
        trect = rects[i];
        if (top_rect == undefined) {
            top_rect = trect;
        } else if ((trect.top <= top_rect.top) && (trect.left <= top_rect.left)) {
            top_rect = trect;
        }
    }

    var mouseX = event.clientX;
    var mouseY = event.clientY;

    var rect;
    for (var i in rects) {
        rect = rects[i];
        if ((mouseX >= rect.left) && (mouseX <= rect.right) && (mouseY >= rect.top) && (mouseY <= rect.bottom)) {
            break;
        }
    }

    var elem_width = rect.width;
    var elem_height = rect.height;

    var rect_offX = rect.left - top_rect.left;
    var rect_offY = rect.top - top_rect.top;

    var pop_width = popup.outerWidth();
    var pop_height = popup.outerHeight();

    var pos_x = 0.5*(elem_width-pop_width) + rect_offX - 4; // for footnotes to line up
    var pos_y = -pop_height + rect_offY;

    return {x: pos_x, y: pos_y};
}

// attach a popup to parent
function attach_popup(parent, popup) {
    var pop_out = $("<div>", {class: "popup-outer"});
    pop_out.append(popup);
    parent.append(pop_out);
    pop_out.attr("shown", "false");
    parent.hover(function(event) {
        if (pop_out.attr("shown") == "false") {
            pop_out.attr("shown", "true");
            var offset = get_offset(parent, pop_out, event);
            pop_out.css("left", offset.x).css("top", offset.y);
            pop_out.fadeIn(150);
        }
    }, function() {
        var tid = window.setTimeout(function() {
            pop_out.fadeOut(150);
            pop_out.attr("shown", "false");
        }, 150);
        parent.mouseenter(function(event) {
            window.clearTimeout(tid);
        });
    });
}

function resolve_references(box) {
    console.log("resolving references");
    if (box == null) {
        box = content;
    }
    box.find(".reference").each(function() {
        var ref = $(this);
        var label = ref.attr("target");
        var targ = content.find("#"+label);
        if (targ.hasClass("equation")) {
            var eqn_num = targ.attr("eqn-num");
            ref.html("<a href=\"#" + label + "\">Equation " + eqn_num + "</a>");
            ref.removeClass("error");
            var popup = $("<div>", {class: "popup eqn-popup", html: targ.children(".equation-inner").html()});
            attach_popup(ref, popup);
        } else if (targ.hasClass("sec-title")) {
            var sec_num = targ.attr("sec-num");
            ref.html("<a href=\"#" + label + "\">Section " + sec_num + "</a>");
            ref.removeClass("error");
            var popup = $("<div>", {class: "popup sec-popup", html: targ.html()});
            attach_popup(ref, popup);
        } else if (targ.hasClass("image")) {
            var cap = targ.children("figcaption");
            var fig_num = cap.attr("fig-num");
            ref.html("<a href=\"#" + label + "\">Figure " + fig_num + "</a>");
            ref.removeClass("error");
            var clone = targ.clone();
            clone.removeAttr("id");
            var popup = $("<div>", {class: "popup fig-popup"}).append(clone);
            attach_popup(ref, popup);
        } else if (targ.hasClass("table")) {
            var cap = targ.children("figcaption");
            var tab_num = cap.attr("tab-num");
            ref.html("<a href=\"#" + label + "\">Table " + tab_num + "</a>");
            ref.removeClass("error");
            var clone = targ.clone();
            clone.removeAttr("id");
            var popup = $("<div>", {class: "popup tab-popup"}).append(clone);
            attach_popup(ref, popup);
        } else if (targ.hasClass("biblio")) {
            reftext = targ.attr("reftext");
            ref.html("<a href=\"#" + label + "\">" + reftext + "</a>");
            ref.removeClass("error");
            var popup = $("<div>", {class: "popup bib-popup", html: targ.html()});
            attach_popup(ref, popup);
        } else {
            ref.html(label);
            ref.addClass("error");
        }
    });
}

function generate_export(fmt) {
    console.log('exporting', fmt);

    // get pure markdown
    var md = '';
    content.children().each(function() {
        var outer = $(this);
        md += outer.attr("base-text");
        md += '\n\n';
    });
    var txt = md.trimRight();

    // convert to proper format
    if ((fmt == "md") || (fmt == "markdown")) {
    } else if (fmt == "mdplus") {
        txt = generate_mdplus(txt);
    } else if (fmt == "html") {
        txt = generate_html(txt);
    } else if ((fmt == "tex") || (fmt == "latex")) {
        txt = generate_latex(txt, config["macros"]);
    } else {
        txt = "Format must be one of: md, markdown, mdplus, html, tex, latex.";
    }

    return txt;
}

// export dispatcher
function display_export(fmt) {
    var txt = generate_export(fmt);
    if ((fmt == "tex") || (fmt == "latex")) {
        txt = txt["out"];
    }
    content.empty();
    content.addClass("overlay");
    var pre = $("<pre>");
    content.append(pre);
    pre.text(txt);
}

/*
 * high level functions
 */

function render(defer) {
    console.log("rendering");
    if (config.markdown != false) {
        var md = unescape_html(content.html());
        content.empty();
        var cells = md.trim().split('\n\n');
        for (i in cells) {
            var c = cells[i].trim();
            var div = $("<div>", {class: "cell", "base-text": c, html: marktwo.parse(c)});
            content.append(div);
        }
        content.children().each(function() {
            var outer = $(this);
            var inner = outer.children().first();
            apply_render(inner, defer);
        });
    } else {
        content.children().each(function() {
            var outer = $(this);
            apply_render(outer, defer);
        });
    }
}

function full_update() {
    number_sections();
    number_equations();
    number_footnotes();
    number_figures();
    number_tables();
    resolve_references();
}

function render_all() {
    render(true);
    full_update();

    if (config.markdown != false) {
        var par = new URLSearchParams(location.search);
        var exp = par.get("export");
        if (exp != null) {
            display_export(exp);
        }
    }
}

function update_config(opts) {
    config = merge({}, defaults, opts || {});
}

function set_content(cont) {
    if (typeof(cont) == "string") {
        cont = $(cont);
    }
    content = cont;
}

// render for static docs
function init(cont, opts) {
    if (opts != undefined) {
        update_config(opts);
    }

    console.log("init");
    console.log(config);

    set_content(cont);

    if (config.markdown != false) {
        if (typeof(config.markdown) == "string") {
            $.get(config.markdown, function(data) {
                content.text(data);
                render_all();
            });
            return;
        }
    }

    if (config.render) {
        render_all();
    }
}

// public interface
return {
    init: init,
    update_config: update_config,
    set_content: set_content,
    apply_render: apply_render,
    full_update: full_update,
    number_footnotes: number_footnotes,
    number_equations: number_equations,
    number_sections: number_sections,
    number_figures: number_figures,
    number_tables: number_tables,
    resolve_references: resolve_references,
    generate_export: generate_export,
    display_export: display_export
};

// end module
})();
