/*
*  Elltwo editor
*/

// globals
html = $("html");
body = $("body");
elltwo_box = $("#elltwo");
outer_box = elltwo_box.children("#content");

// utils
var max = function(arr) {
  return Math.max.apply(null,arr);
};

var min = function(arr) {
  return Math.min.apply(null,arr);
};

// regexes
var sec_re = /^(#+)([^!].*)/;
var img_re = /^!\[([^\]]*)\]/;
var label_re = /^ *\[([\w-_]+)\](.*)/;
var ulist_re = /[\-](.*)/;
var olist_re = /[\+](.*)/;

function inline_marker(match, p, offset, string) {
  return '<span class=\"latex\">' + p + '</span>';
}
var inline_re = /\$([^\$]*)\$/g;

function display_marker(match, p, offset, string) {
  return '<div class=\"equation\">' + p.replace(/\n/g,' ') + '</div>';
}
var display_re = /\$\$([^\$]*)\$\$/g;

function reference_marker(match, p, offset, string) {
  return '<span class=\"reference\" target=\"' + p + '\"></span>';
}
var reference_re = /@\[(.+)\]/g;

// convert text (with newlines) to html (with divs) and vice versa
function fill_tags(text) {
  if (text.includes('\n')) {
    return '<div>' + text.replace(/\n/g,'</div><div>') + '</div>';
  } else {
    return text;
  }
};

function strip_tags(html) {
  if (html.startsWith('<div>')) {
    html = html.replace(/<div>/,'');
  }
  return html.replace(/<div ?.*?>/g,'\n')
             .replace(/<\/div>/g,'')
             .replace(/<br>/g,'\n')
             .replace(/\n+/g,'\n')
             .replace(/<span ?.*?>/g,'')
             .replace(/<\/span>/g,'');
};

function escape_html(text) {
  return text.replace(/</g,'&lt;')
             .replace(/>/g,'&gt;');
};

function unescape_html(text) {
  return text.replace(/&lt;/g,'<')
             .replace(/&gt;/g,'>')
             .replace(/&amp;/g,'&')
             .replace(/&nbsp;/g,' ');
};

// selection and cursor/caret utilities
function clear_selection() {
  var sel = window.getSelection();
  sel.removeAllRanges();
}

function set_caret_at_beg(element) {
  var range = document.createRange();
  range.setStart(element,0);
  range.collapse(false);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  element.focus();
}

function set_caret_at_end(element) {
  var range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  element.focus();
}

function get_caret_position(element) {
  sel = window.getSelection();
  if (sel.rangeCount > 0) {
    var range = window.getSelection().getRangeAt(0);
    var preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    caretOffset = preCaretRange.toString().length;
  }
  return caretOffset;
}

function get_text_length(element) {
  return element.textContent.length;
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
    html.stop();
    html.animate({scrollTop: cell_top - scrollFudge}, scrollSpeed);
  } else if (cell_bot > page_bot) {
    html.stop();
    html.animate({scrollTop: cell_bot - window.innerHeight + scrollFudge},scrollSpeed);
  }

  // change focus
  cell.focus();

  // update cell var
  active = cell;
}

function activate_prev() {
  var prev = active.prev(".para_outer");
  if (prev.length > 0) {
    activate_cell(prev);
    return true;
  } else {
    return false;
  }
}

function activate_next() {
  var next = active.next(".para_outer");
  if (next.length > 0) {
    activate_cell(next);
    return true;
  } else {
    return false;
  }
}

// inner cell renderer
function render(box,text,defer) {
  defer = defer || false;

  // escape carets
  text = escape_html(text);

  // classify cell type
  if (text.startsWith('#!')) {
    text = text.slice(2);
    box.addClass('title');
  } else if (ret = sec_re.exec(text)) {
    var lvl = ret[1].length;
    var title = ret[2];
    box.addClass('section_title');
    box.addClass('section_level'+lvl);
    box.attr("sec-lvl",lvl);
    if (ret = label_re.exec(title)) {
      label = ret[1];
      title = ret[2];
      box.attr("id",label);
      box.addClass("numbered");
    }
    text = title;
    new_section = true;
  } else if (text.startsWith('-')) {
    var items = text.slice(1).split('\n-');
    var list = '<ul>';
    for (i in items) {
      var item = items[i];
      list += '<li>' + (item.trim().replace(/\n/g,' ') || ' ') + '</li>'
    }
    list += '</ul>';
    text = list;
  } else if (text.startsWith('+')) {
    var items = text.slice(1).split('\n+');
    var list = '<ol>';
    for (i in items) {
      var item = items[i];
      list += '<li>' + (item.trim().replace(/\n/g,' ') || ' ') + '</li>';
    }
    list += '</ol>';
    text = list;
  } else if (ret = img_re.exec(text)) {
    var src = ret[1];
    box.addClass("image");
    text = '<img src="' + src + '"/>';
  }

  // tag markers
  text = text.replace(display_re,display_marker);
  text = text.replace(inline_re,inline_marker);
  text = text.replace(reference_re,reference_marker);
  var html = fill_tags(text);
  box.html(html);

  // inline-ish elements
  box.find(".latex").each(function() {
    var span = $(this);
    var text = span.text();
    katex.render(text,span[0],{throwOnError: false});
  });

  // typeset disyplay equations
  box.find(".equation").each(function () {
    var eqn = $(this);
    var src = eqn.html().replace(/\n/g," ");

    var num_div = $("<div>",{class:"equation_number"});
    var div_inner = $("<div>",{class:"equation_inner"});

    var ret = label_re.exec(src);
    var label;
    if (ret) {
      label = ret[1];
      src = ret[2];
      eqn.attr("id",label);
      eqn.addClass("numbered");
    }

    $(src.split('\\\\')).each(function (i,txt) {
      var row = $("<div>",{class:"equation_row"});
      katex.render(txt,row[0],{displayMode: true, throwOnError: false});
      div_inner.append(row);
    });

    eqn.html("");
    eqn.append(num_div);
    eqn.append(div_inner);

    var eqn_boxes = div_inner.children(".equation_row");
    if (eqn_boxes.length > 1) {
      eqn.addClass("multiline");
    }

    new_equation = true;
  });

  // recalculate sections, equations, and references
  if (!defer) {
    if (new_section) {
      number_sections();
    }
    if (new_equation) {
      polish_equations();
    }
    resolve_references(box);
  }
}

// save cell to server
function save_cell(cell) {
  // get source text
  var cid = cell.attr("cid");
  var body = cell.attr("base_text");

  // send to server
  var msg = JSON.stringify({"cmd": "save", "content": {"cid":cid, "body": body}});
  console.log(msg);
  ws.send(msg);

  // mark document as modified (cell not so)
  outer.removeClass("modified");
  elltwo_box.addClass("modified");
}

// create cell (after para_outer)
function create_cell(cell) {
  // generate id and stitch into linked list
  var newid = Math.max.apply(null,$(".para_outer").map(function() { return $(this).attr("cid"); }).toArray()) + 1;
  var prev = cell.attr("cid");
  var next = cell.attr("next");
  var cnext = $(".para_outer[cid="+next+"]");
  cnext.attr("prev",newid);
  cell.attr("next",newid);

  // generate html
  var outer = make_para("",newid,prev,next,true);
  outer.insertAfter(cell);

  // place caret inside
  var inner = outer.children(".para_inner");
  set_caret_at_end(inner[0]);

  // activate cell
  activate_cell(outer);

  // notify server
  var msg = JSON.stringify({"cmd": "create", "content": {"newid": newid, "prev": prev, "next": next}});
  console.log(msg);
  ws.send(msg);

  // mark document modified
  elltwo_box.addClass("modified");
}

// delete cell (para_outer)
function delete_cell(cell) {
  // snip out of linked list
  prev = cell.attr("prev");
  next = cell.attr("next");
  cprev = $(".para_outer[cid="+prev+"]");
  cnext = $(".para_outer[cid="+next+"]");
  cprev.attr("next",next);
  cnext.attr("prev",prev);

  // delete from DOM
  cell.remove();

  // inform server
  var cid = cell.attr("cid");
  var msg = JSON.stringify({"cmd": "delete", "content": {"cid": cid, "prev": prev, "next": next}});
  console.log(msg);
  ws.send(msg);

  // mark document modified
  elltwo_box.addClass("modified");
}

function freeze_cell(outer) {
  var inner = outer.children(".para_inner");
  var html = inner.html();
  var text = strip_tags(html);
  var base = unescape_html(text);
  outer.attr("base_text",base);
  if (outer.hasClass("modified")) {
    save_cell(outer);
  }
  outer.removeClass("editing");
  inner.attr("contentEditable","false");
  render(inner,text);
}

function unfreeze_cell(outer) {
  var inner = outer.children(".para_inner");
  outer.attr("disp_html",inner.html());
  outer.addClass("editing");
  inner.removeClass();
  inner.addClass('para_inner');
  var base = outer.attr("base_text");
  var text = escape_html(base);
  inner.html(text);
  inner.attr("contentEditable","true");
  set_caret_at_end(inner[0]);
}

function make_toolbar(outer) {
  var bar = $("<div>",{class:"toolbar"});
  var add = $("<span>",{class:"add_button",html:"+"});
  var del = $("<span>",{class:"del_button",html:"x"});
  add.click(function() {
    create_cell(outer);
  });
  del.click(function() {
    activate_next(outer);
    delete_cell(outer);
  });
  bar.append(add);
  bar.append(del);
  return bar;
};

function make_para(text,cid,prev,next,edit,defer) {
  edit = edit || false;
  defer = defer || false;

  var outer = $("<div>",{class:"para_outer"});
  outer.attr("cid",cid);
  outer.attr("prev",prev);
  outer.attr("next",next);
  var inner = $("<div>",{class:"para_inner"});
  outer.attr("base_text",text);
  render(inner,text,defer);
  inner.click(function(event) {
    activate_cell(outer);
  });
  inner.dblclick(function(event) {
    if (!outer.hasClass("editing") && elltwo_box.hasClass("editing")) {
      unfreeze_cell(outer);
    }
  });
  inner.keydown(function(event) {
    if (outer.hasClass("editing")) {
      if (event.keyCode == 13) { // return
        if (event.shiftKey) {
          freeze_cell(outer);
          event.preventDefault();
        } else {
          var cpos = get_caret_position(inner[0]);
          var tlen = get_text_length(inner[0]);
          if (cpos == tlen) {
            create_cell(outer);
            return false;
          }
        }
      } else if (event.keyCode == 27) { // escape
        freeze_cell(outer);
        event.preventDefault();
      } else if (event.keyCode == 8) { // backspace
        var tlen = get_text_length(inner[0]);
        if (tlen == 0) {
          if (activate_prev(outer)) {
            // if (active.hasClass("editing")) {
            //   set_caret_at_end(prev[0]);
            // }
            delete_cell(outer);
          }
          event.preventDefault();
        }
      } else if (event.keyCode == 38) { // up
        var cpos = get_caret_position(inner[0]);
        if (cpos == 0) {
          activate_prev(outer);
          clear_selection();
          return false;
        }
      } else if (event.keyCode == 40) { //down
        var cpos = get_caret_position(inner[0]);
        var tlen = get_text_length(inner[0]);
        if (cpos == tlen) {
          if (activate_next(outer)) {
            clear_selection();
            return false;
          }
        }
      }
    }
  });
  inner.bind("input", function() {
    outer.addClass("modified");
  });

  if (edit) {
    outer.attr("disp_html",inner.html());
    outer.addClass("editing");
    inner.html(outer.attr("base_html"));
    inner.attr("contentEditable","true");
  }
  outer.append(inner);
  outer.append(make_toolbar(outer));
  return outer;
}

function number_sections() {
  console.log('numbering sections');
  var sec_num = Array();
  sec_num[0] = "";
  sec_num[1] = 0;
  $(".section_title").each(function() {
    var sec = $(this);
    var lvl = parseInt(sec.attr("sec-lvl"));
    sec_num[lvl]++;
    sec_num[lvl+1] = 0;
    var lab = sec_num.slice(1,lvl+1).join('.');
    sec.attr("sec_num",lab);
  });
}

function polish_equations() {
  console.log('polishing equations');

  eqn_num = 1;
  $(".equation.numbered").each(function() {
    var eqn = $(this);
    var num = eqn.children(".equation_number");
    eqn.attr("eqn_num",eqn_num);
    num.html(eqn_num);
    eqn_num++;
  });

  $(".equation.multiline").each(function() {
    var eqn = $(this);
    var div_inner = eqn.children(".equation_inner")
    var eqn_boxes = div_inner.children(".equation_row");
    if (eqn_boxes.length > 1) {
      var leftlist = [];
      var rightlist = [];
      var offlist = [];
      eqn_boxes.each(function () {
        var eqn = $(this);
        var rwidth = eqn.width();
        var ktx = eqn.children(".katex");
        var kwidth = ktx.width();
        var anchor = ktx.find(".align");
        var leftpos;
        var rightpos;
        if (anchor.length) {
          leftpos = (anchor.offset().left+anchor.width()/2) - ktx.offset().left;
          rightpos = kwidth - leftpos;
        } else {
          leftpos = kwidth/2;
          rightpos = kwidth/2;
        }
        var myoff = rightpos - leftpos;
        leftlist.push(leftpos);
        rightlist.push(rightpos);
        offlist.push(myoff);
      });
      var bigoff = max(leftlist) - max(rightlist);

      if (eqn.attr('id') == 'debug') {
        console.log(leftlist);
        console.log(rightlist);
        console.log(offlist);
        console.log(bigoff);
      }

      eqn_boxes.each(function (i) {
        var ktx = $(this).children(".katex");
        ktx.css({"margin-left":bigoff+offlist[i]});
      });
    }
  });
}

function resolve_references() {
  console.log('resolving references');
  $(".reference").each(function() {
    var ref = $(this);
    var label = ref.attr("target");
    var targ = $("#"+label);
    if (targ.hasClass("equation")) {
      var eqn_num = targ.attr("eqn_num");
      ref.html("<a href=\"#" + label + "\">Equation " + eqn_num + "</a>");
      ref.removeClass("error");
    } else if (targ.hasClass("section_title")) {
      var sec_num = targ.attr("sec_num");
      ref.html("<a href=\"#" + label + "\">Section " + sec_num + "</a>");
      ref.removeClass("error");
    } else {
      ref.html(label);
      ref.addClass("error");
    }
  });
}

function full_render() {
  console.log('rendering');
  new_section = false;
  new_equation = false;
  $("div.par").replaceWith(function() {
    var par = $(this);
    return make_para(par.html(),par.attr("cid"),par.attr("prev"),par.attr("next"),false,true);
  });
  if (new_section) {
    number_sections();
  }
  if (new_equation) {
    polish_equations();
  }
  resolve_references();
}

// initialization code
function initialize() {
  // optional marquee box
  var marquee = elltwo_box.children("#marquee");
  if (marquee) {
    var span = $("<span>");
    katex.render("\\ell^2",span[0]);
    marquee.append(span);
  }

  // topbar button handlers
  $("#topbar_markdown").click(function() {
    window.location.replace("/markdown/"+fname);
  });

  $("#topbar_html").click(function() {
    var edit = elltwo_box.hasClass("editing");
    elltwo_box.removeClass("editing");
    elltwo_box.addClass("nocontrol");
    var ns = new XMLSerializer();
    var html = ns.serializeToString(elltwo_box[0]);
    var msg = JSON.stringify({"cmd": "html", "content": html});
    console.log(msg);
    ws.send(msg);
    if (edit) {
      elltwo_box.addClass("editing");
    }
    elltwo_box.removeClass("nocontrol");
  });

  $("#topbar_latex").click(function() {
    window.location.replace("/latex/"+fname);
  });

  $("#topbar_pdf").click(function() {
    window.location.replace("/pdf/"+fname);
  });

  $("#topbar_save").click(function() {
    var msg = JSON.stringify({"cmd": "write", "content": ""});
    console.log(msg);
    ws.send(msg);
    elltwo_box.removeClass("modified");
  });

  $("#topbar_revert").click(function() {
    var msg = JSON.stringify({"cmd": "revert", "content": ""});
    console.log(msg);
    ws.send(msg);
    elltwo_box.removeClass("modified");
  });

  $("#topbar_reload").click(function() {
    var msg = JSON.stringify({"cmd": "query", "content": ""});
    ws.send(msg);
  });

  $("#topbar_editing").click(function() {
    elltwo_box.toggleClass("editing");
  });

  // vim-like controls :)
  $(window).keydown(function(event) {
    console.log(event.keyCode);
    if (elltwo_box.hasClass("editing")) {
      if (active.hasClass("editing")) {
        // handled in cell
      } else {
        if (event.keyCode == 38) { // up
          activate_prev();
          if (active.hasClass("editing")) {
            var inner = active.children(".para_inner");
            set_caret_at_end(inner[0]);
            return false;
          }
        } else if (event.keyCode == 40) { // down
          activate_next();
          if (active.hasClass("editing")) {
            var inner = active.children(".para_inner");
            set_caret_at_beg(inner[0]);
            return false;
          }
        } else if (event.keyCode == 87) { // w
          unfreeze_cell(active);
          return false;
        } else if (event.keyCode == 79) { // o
          create_cell(active);
          return false;
        }
      }
    } else {
      // nothing to do in frozen mode
    }
  });
}

// websockets
function connect()
{
  if ('MozWebSocket' in window) {
    WebSocket = MozWebSocket;
  }
  if ('WebSocket' in window) {
    var ws_con = "ws://" + window.location.host + "/elledit/" + fname;
    console.log(ws_con);

    ws = new WebSocket(ws_con);

    ws.onopen = function() {
      console.log('websocket connected!');
      var msg = JSON.stringify({"cmd": "query", "content": ""});
      ws.send(msg);
    };

    ws.onmessage = function (evt) {
      var msg = evt.data;
      // console.log('Received: ' + msg);

      var json_data = JSON.parse(msg);
      if (json_data) {
        var cmd = json_data['cmd'];
        var cont = json_data['content'];
        if (cmd == 'results') {
          var cells = json_data['content'];
          outer_box.children(".para_outer").remove();
          for (i in cells) {
            var c = cells[i];
            var div = $("<div>",{html: c["body"], class: "par"});
            div.attr("cid",c["cid"]);
            div.attr("prev",c["prev"]);
            div.attr("next",c["next"]);
            outer_box.append(div);
          }
          full_render();
          active = outer_box.children(".para_outer").first();
          active.addClass("active");
        } else if (cmd == 'html') {
          window.location.replace("/html/"+fname);
        }
      }
    };

    ws.onclose = function() {
      console.log('websocket closed, trying to reestablish');
      window.setTimeout(function() {
        ws = new WebSocket(ws_con);
      }, 1);
    };
  } else {
    console.log('Sorry, your browser does not support websockets.');
  }
}

function disconnect()
{
  if (ws) {
    ws.close();
  }
}

// when ready
$(document).ready(function() {
  console.log(fname);
  initialize();
  connect();
});
