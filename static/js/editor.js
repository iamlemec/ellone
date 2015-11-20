/*
*  Elltwo editor
*/

// globals
html = $("html");
body = $("body");
elltwo_box = $("#elltwo");
outer_box = elltwo_box.children("#content");

// utils
function max(arr) {
  return Math.max.apply(null,arr);
};

function min(arr) {
  return Math.min.apply(null,arr);
};

// escaping

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

// cell utils
function get_inner(outer) {
  return outer.children(".para_inner")[0];
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
  range.setStart(inner,0);
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
    body.animate({scrollTop: cell_bot - window.innerHeight + scrollFudge},scrollSpeed);
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
var esc_re = /\\([\[\]\(\)@])/g;
var sec_re = /^(#+)([^!].*)/;
var img_re = /^!\[([^\]]*)\]\(?([^\)]*)\)?/;
var label_re = /^ *\[([\w-_]+)\](.*)/;
var ulist_re = /[\-](.*)/;
var olist_re = /[\+](.*)/;

function resolve_url(url) {
  if (url.search('(^|:)//') == -1) {
    if (url[0] != '/') {
      url = "/" + curdir + url;
    }
    url = "/local" + url;
  }
  return url;
}

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

function link_marker(match, p1, p2, offset, string) {
  var href = resolve_url(p2);
  return '<a href=\"' + href + '\">' + p1 + '</a>';
}
var link_re = /\[([^\]]*)\]\(([^\)]*)\)/g;

function code_marker(match, p, offset, string) {
  return '<code>' + p + '</code>';
}
var code_re = /`([^`]*)`/g;

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
    var cap = ret[2];
    src = resolve_url(src);
    box.addClass("image");
    text = '<img src="' + src + '"/>';
    if (cap.length > 0) {
      text += '<p class="caption">' + cap + '</p>';
    }
  }

  // tag markers
  text = text.replace(display_re,display_marker);
  text = text.replace(inline_re,inline_marker);
  text = text.replace(reference_re,reference_marker);
  text = text.replace(link_re,link_marker);
  text = text.replace(code_re,code_marker);

  // unescape special chars
  text = text.replace(esc_re,'$1');

  // convert to html
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
  cell.removeClass("modified");
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

  // activate cell
  activate_cell(outer);

  // place caret inside
  set_caret_at_end(outer);

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

// go into static mode
function freeze_cell(outer) {
  clear_selection();
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

// start editing cell
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
  set_caret_at_end(outer);
}

// send to the server for storage
function save_document() {
  var msg = JSON.stringify({"cmd": "write", "content": ""});
  console.log(msg);
  ws.send(msg);
  elltwo_box.removeClass("modified");
}

// create mouseover toolbar for cell
function make_toolbar(outer) {
  var bar = $("<div>",{class:"toolbar"});
  var add = $("<span>",{class:"add_button",html:"+"});
  var del = $("<span>",{class:"del_button",html:"x"});
  add.click(function() {
    create_cell(outer);
  });
  del.click(function() {
    if (!activate_next()) {
      activate_prev();
    }
    delete_cell(outer);
    if (is_editing(active)) {
      set_caret_at_end(active);
    }
  });
  bar.append(add);
  bar.append(del);
  return bar;
};

// make paragraph for cell
function make_para(text,cid,prev,next,edit,defer) {
  edit = edit || false;
  defer = defer || false;

  // insert into list
  var outer = $("<div>",{class:"para_outer"});
  outer.attr("cid",cid);
  outer.attr("prev",prev);
  outer.attr("next",next);

  // render inner paragraph
  var inner = $("<div>",{class:"para_inner"});
  outer.attr("base_text",text);
  render(inner,text,defer);

  // event handlers
  inner.click(function(event) {
    if (is_editing(elltwo_box)) {
      activate_cell(outer);
    }
  });
  inner.bind("input", function() {
    outer.addClass("modified");
  });

  // start out editing?
  if (edit) {
    outer.attr("disp_html",inner.html());
    outer.addClass("editing");
    inner.html(outer.attr("base_html"));
    inner.attr("contentEditable","true");
  }

  // insert into DOM
  outer.append(inner);
  //outer.append(make_toolbar(outer));

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
        var ktx = eqn.find(".katex");
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
        var ktx = $(this).find(".katex");
        ktx.css({"margin-left":bigoff+offlist[i]});
      });
    }
  });
}

// for a hover event and scale factor (of the realized object), generate appropriate css
var get_offset = function(parent,popup,event) {
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

  return {x:pos_x,y:pos_y};
};

// attach a popup to parent
function attach_popup(parent,popup) {
  var pop_out = $("<div>",{class:"popup_outer"});
  pop_out.append(popup);
  parent.append(pop_out);
  pop_out.attr("shown","false");
  parent.hover(function(event) {
    if (pop_out.attr("shown")=="false") {
      pop_out.attr("shown","true");
      var offset = get_offset(parent,pop_out,event);
      pop_out.css("left",offset.x).css("top",offset.y);
      pop_out.fadeIn(150);
    }
  }, function() {
    var tid = window.setTimeout(function() {
      pop_out.fadeOut(150);
      pop_out.attr("shown","false");
    },150);
    parent.mouseenter(function(event) {
      window.clearTimeout(tid);
    });
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
      var popup = $("<div>",{class:"popup eqn_popup",html:targ.children(".equation_inner").html()});
      attach_popup(ref,popup);
    } else if (targ.hasClass("section_title")) {
      var sec_num = targ.attr("sec_num");
      ref.html("<a href=\"#" + label + "\">Section " + sec_num + "</a>");
      ref.removeClass("error");
      var popup = $("<div>",{class:"popup sec_popup",html:targ.html()});
      attach_popup(ref,popup);
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
  // marquee box
  var marquee = elltwo_box.children("#marquee");
  var help = $('#help');
  var span = $("<span>");
  katex.render("\\ell^2",span[0]);
  span.click(function() {
    help.slideToggle('fast');
  });
  marquee.append(span);

  // topbar button handlers
  $("#topbar_export").click(function() {
    $("#topbar_slide").slideToggle("fast");
    $(this).toggleClass("expanded");
  });

  $("#topbar_markdown").click(function() {
    window.location.replace("/markdown/"+path);
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
    window.location.replace("/latex/"+path);
  });

  $("#topbar_pdf").click(function() {
    window.location.replace("/pdf/"+path);
  });

  $("#topbar_save").click(function() {
    save_document();
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

    var keyCode = event.keyCode;
    var docEdit = is_editing(elltwo_box);
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
          create_cell(active);
          return false;
        }
      } else if (keyCode == 13) { // return
        if (actEdit) {
          if (event.shiftKey) {
            freeze_cell(active);
            create_cell(active);
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
        if (!$(event.target).hasClass("para_inner")) {
          event.preventDefault();
        }
      } else if (keyCode == 68) { // d
        if (event.shiftKey && !is_editing(active)) {
          outer = active;
          if (!activate_next()) {
            activate_prev();
          }
          delete_cell(outer);
          if (is_editing(active)) {
            set_caret_at_end(active);
          }
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

// websockets
function connect()
{
  if ('MozWebSocket' in window) {
    WebSocket = MozWebSocket;
  }
  if ('WebSocket' in window) {
    var ws_con = "ws://" + window.location.host + "/elledit/" + path;
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
          window.location.replace("/html/"+path);
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
  console.log(path);
  initialize();
  connect();
});
