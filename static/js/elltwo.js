/*
*  Elltwo standalone
*/

// begin module
var elltwo = (function() {

// find outer box
var content = $("#elltwo");

// urls
var resolve_url = function(url) {
    if (curdir != null) {
        if (url.search("(^|:)//") == -1) {
            if (url[0] != "/") {
                if (curdir.length == 0) {
                    url = "/" + url;
                } else {
                    url = "/" + curdir + "/" + url;
                }
            }
        }
    }
    return url;
};

// rendering
var apply_render = function(box, defer) {
    var new_section = false;
    var new_equation = false;
    var new_footnote = false;
    var new_reference = false;

    // final substitutions
    var tag = box[0].tagName;

    // handle sections
    if (tag == "TITLE") {
        var div = $("<div>", {class: "doc-title", html: box.text()});
        box.replaceWith(div);
        box = div;
    }

    if ((tag[0] == "H") && (tag.length == 2)) {
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
        img.attr("src", resolve_url(src));
    });

    // handle footnotes
    box.find("footnote").replaceWith(function() {
        new_footnote = true;
        var fnote = $(this);
        var text = fnote.html();
        var span = $("<span>", {class: "footnote"});
        var num = $("<span>", {class: "number"});
        var popup = $("<div>", {class: "popup footnote-popup", html: text});
        span.append(num);
        attach_popup(span, popup);
        return span;
    });

    // handle inline latex
    box.find("tex").replaceWith(function() {
        var tex = $(this);
        var src = tex.text();
        var span = $("<span>", {class: "latex"});
        katex.render(src, span[0], {throwOnError: false});
        return span;
    });

    // handle references
    box.find("ref").replaceWith(function() {
        new_reference = true;
        var ref = $(this);
        var targ = ref.text();
        var span = $("<span>", {class: "reference", target: targ});
        return span;
    });

    // typeset disyplay equations
    if (tag == "EQUATION") {
        var src = box.text();

        var num_div = $("<div>", {class: "equation-number"});
        var div_inner = $("<div>", {class: "equation-inner"});

        var tex = "\\begin{aligned}\n" + src + "\n\\end{aligned}";
        katex.render(tex, div_inner[0], {displayMode: true, throwOnError: false});

        var eq = $("<div>", {class: "equation"});
        var id = box.attr("id");
        if (id != null) {
            new_equation = true;
            eq.addClass("numbered");
            eq.attr("id", id);
        }

        eq.append(num_div);
        eq.append(div_inner);
        box.replaceWith(eq);
        box = eq;
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
        if (new_section || new_equation) {
            resolve_references();
        } else {
            if (new_reference) {
                resolve_references(box);
            }
        }
    }
};

var render = function(defer) {
    console.log("rendering");
    if (content.hasClass("markdown")) {
        var md = content.text();
        var html = marktwo.parse(md);
        content.html(html);
        content.removeClass("markdown");
    }
    content.children().each(function() {
        var outer = $(this);
        apply_render(outer, defer);
    });
};

var number_sections = function() {
    console.log("numbering sections");
    var sec_num = Array();
    sec_num[0] = "";
    sec_num[1] = 0;
    content.find(".sec-title").each(function() {
        var sec = $(this);
        var lvl = parseInt(sec.attr("sec-lvl"));
        sec_num[lvl]++;
        sec_num[lvl+1] = 0;
        var lab = sec_num.slice(1, lvl+1).join(".");
        sec.attr("sec-num", lab);
    });
};

var number_equations = function() {
    console.log("numbering equations");

    eqn_num = 1;
    content.find(".equation.numbered").each(function() {
        var eqn = $(this);
        var num = eqn.children(".equation-number");
        eqn.attr("eqn-num", eqn_num);
        num.html(eqn_num);
        eqn_num++;
    });
};

// for a hover event and scale factor (of the realized object), generate appropriate css
var get_offset = function(parent, popup, event) {
    var rects = parent[0].getClientRects();
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

    var pop_width = popup.outerWidth();
    var pop_height = popup.outerHeight();

    var pos_x = 0.5*(elem_width-pop_width);
    var pos_y = -pop_height;

    return {x: pos_x, y: pos_y};
};

// attach a popup to parent
var attach_popup = function(parent, popup) {
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
};

var resolve_references = function(box) {
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
        } else {
            ref.html(label);
            ref.addClass("error");
        }
    });
};

// renumber footnotes
var number_footnotes = function() {
    console.log("numbering footnotes");
    var n_footnotes = 0;
    content.find(".footnote").each(function () {
        var fnote = $(this);
        var num = fnote.children(".number");
        var foot_num = ++n_footnotes;
        num.text(foot_num);
    });
};

// render for static docs
var init = function() {
    curdir = null;
    render(true);
    number_sections();
    number_equations();
    number_footnotes();
    resolve_references();
}

// optional marquee box
var marquee = $("#marquee");
if (marquee.length > 0) {
    var span = $("<span>", {class: "latex"});
    katex.render("\\ell^2", span[0], {throwOnError: false});
    marquee.append(span);
}

// public interface
return {
    init: init,
    apply_render: apply_render,
    number_footnotes: number_footnotes,
    number_equations: number_equations,
    number_sections: number_sections,
    resolve_references: resolve_references,
}

// end module
})();
