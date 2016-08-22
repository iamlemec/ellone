/*
*  Elltwo standalone
*/

// begin module
var elltwo = (function() {

function apply_render(box) {
    // handle footnotes
    box.find(".footnote").each(function() {
        var fnote = $(this);
        var text = fnote.html();
        fnote.html("<span class=\"number\"></span>");
        var popup = $("<div>", {class: "popup footnote-popup", html: text});
        attach_popup(fnote, popup);
    });

    // inline-ish elements
    box.find(".latex").each(function() {
        var span = $(this);
        var text = span.text();
        katex.render(text, span[0], {throwOnError: false});
    });

    // typeset disyplay equations
    box.find(".equation").each(function() {
        var eqn = $(this);
        var src = eqn.text();

        var num_div = $("<div>", {class: "equation-number"});
        var div_inner = $("<div>", {class: "equation-inner"});

        var tex = "\\begin{aligned}\n" + src + "\n\\end{aligned}";
        katex.render(tex, div_inner[0], {displayMode: true, throwOnError: false});

        eqn.html("");
        eqn.append(num_div);
        eqn.append(div_inner);
    });

    // encapsulate in cell
    var cell = $("<div>", {class: "cell"});
    box.wrap(cell);
}

function render() {
    console.log("rendering");
    outer_box.children().each(function() {
        var outer = $(this);
        apply_render(outer);
    });
}

function number_sections() {
    console.log("numbering sections");
    var sec_num = Array();
    sec_num[0] = "";
    sec_num[1] = 0;
    $(".sec-title").each(function() {
        var sec = $(this);
        var lvl = parseInt(sec.attr("sec-lvl"));
        sec_num[lvl]++;
        sec_num[lvl+1] = 0;
        var lab = sec_num.slice(1, lvl+1).join(".");
        sec.attr("sec-num", lab);
    });
}

function number_equations() {
    console.log("numbering equations");

    eqn_num = 1;
    $(".equation.numbered").each(function() {
        var eqn = $(this);
        var num = eqn.children(".equation-number");
        eqn.attr("eqn-num", eqn_num);
        num.html(eqn_num);
        eqn_num++;
    });
}

// for a hover event and scale factor (of the realized object), generate appropriate css
function get_offset(parent, popup, event) {
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
function attach_popup(parent, popup) {
    var pop_out = $("<div>", {class: "popup_-uter"});
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

function resolve_references() {
    console.log("resolving references");
    $(".reference").each(function() {
        var ref = $(this);
        var label = ref.attr("target");
        var targ = $("#"+label);
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
}

// renumber footnotes
function number_footnotes() {
    console.log("numbering footnotes");
    var n_footnotes = 0;
    $(".footnote").each(function () {
        var fnote = $(this);
        var num = fnote.children(".number");
        var foot_num = ++n_footnotes;
        num.text(foot_num);
    });
}

// public interface
return {
    init: function() {
        // find outer box
        body = $("body");
        elltwo_box = $("#elltwo");
        outer_box = $("#content");

        // run
        render();
        number_sections();
        number_equations();
        number_footnotes();
        resolve_references();

        // optional marquee box
        if (marquee=$("#marquee")) {
            var span = $("<span>", {class: "latex"});
            katex.render("\\ell^2", span[0], {throwOnError: false});
            marquee.append(span);
        }
    }
}

// end module
})();

// when ready
$(document).ready(function() {
    elltwo.init();
});
