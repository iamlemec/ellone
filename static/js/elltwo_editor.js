// Elltwo editor

function select_all(elem) {
  var selection = window.getSelection();
  var range = document.createRange();
  range.selectNodeContents(elem);
  selection.removeAllRanges();
  selection.addRange(range);
}

// editing hooks
function inline_marker(match, p, offset, string) {
  return '<span class=\"latex\">' + p + '</span>';
}
var inline_re = /\$([^\$]*)\$/g;

function display_marker(match, p, offset, string) {
  return '<div class=\"equation\">' + p + '</div>';
}
var display_re = /\$\$([^\$]*)\$\$/g;

function reference_marker(match, p, offset, string) {
  return '<span class=\"reference\" target=\"' + p + '\"></span>';
}
var reference_re = /@\[(.+)\]/g;

function initialize() {
  make_toolbar = function(outer) {
    var bar = $("<div>",{class:"toolbar"});
    var add = $("<span>",{class:"add_button",html:"+"});
    var del = $("<span>",{class:"del_button",html:"x"});
    add.click(function() {
      create_cell(outer);
    });
    del.click(function() {
      delete_cell(outer);
    });
    bar.append(add);
    bar.append(del);
    return bar;
  }

  // find outer box
  elltwo_box = $("div.elltwo");
  outer_box = elltwo_box.children("div.content");

  // optional marquee box
  if (marquee=elltwo_box.children("div.marquee")) {
    var span = $("<span>");
    katex.render("\\ell^2",span[0]);
    marquee.append(span);
  }

  // topbar (save button)
  $("span.topbar_save").click(function() {
    var msg = JSON.stringify({"cmd": "write", "content": ""});
    console.log(msg);
    ws.send(msg);
    elltwo_box.removeClass("modified");
  });

  $("span.topbar_revert").click(function() {
    var msg = JSON.stringify({"cmd": "revert", "content": ""});
    console.log(msg);
    ws.send(msg);
    elltwo_box.removeClass("modified");
  });

  $("span.topbar_reload").click(function() {
    var msg = JSON.stringify({"cmd": "query", "content": ""});
    ws.send(msg);
  });

  $("span.topbar_editing").click(function() {
    elltwo_box.toggleClass("editing");
  });

  // core renderer
  var sec_re = /(#+)([^!].*)/;
  var lab_re = /\[(.+)\] (.*)/;
  var render = function(box,defer) {
    defer = defer || false;

    var html = box.html();
    if (html.startsWith('#!')) {
      box.html(html.slice(2));
      box.addClass('title');
    }

    var ret = sec_re.exec(html);
    if (ret) {
      var lvl = ret[1].length;
      var title = ret[2];
      box.addClass('section_title');
      box.addClass('section_level'+lvl);
      box.attr("sec-lvl",lvl);
      var ret = lab_re.exec(title);
      if (ret) {
        label = ret[1];
        title = ret[2];
        box.attr("id",label);
        box.addClass("numbered");
      }
      box.html(title);
      new_section = true;
    }

    box.html(box.text().replace(display_re,display_marker));
    box.html(box.html().replace(inline_re,inline_marker));
    box.html(box.html().replace(reference_re,reference_marker));

    box.children("span.latex").each(function() {
      var span = $(this);
      var text = span.text();
      try {
        katex.render(text,span[0]);
      } catch(e) {
        span.html(text);
        span.css({'color': 'red'});
      }
    });

    box.children("div.equation").each(function () {
      var eqn = $(this);
      var src = eqn.html();

      var num_div = $("<div>",{class:"equation_number"});
      var div_inner = $("<div>",{class:"equation_inner"});

      var ret = lab_re.exec(src);
      var label;
      if (ret) {
        label = ret[1];
        src = ret[2];
        eqn.attr("id",label);
        eqn.addClass("numbered");
      }

      $(src.split('\\\\')).each(function (i,txt) {
        var row = $("<div>",{class:"equation_row"});
        try {
          katex.render("\\displaystyle{" + txt + "}",row[0]);
        } catch(err) {
          row.html(txt);
          console.log(err);
          row.css({'color': 'red'});
        }
        div_inner.append(row);
      });

      eqn.html("");
      eqn.append(num_div);
      eqn.append(div_inner);

      var eqn_boxes = div_inner.children(".equation_row");
      if (eqn_boxes.length > 1) {
        var leftlist = [];
        var rightlist = [];
        var offlist = [];
        eqn_boxes.each(function () {
          var eqn = $(this);
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
        var bigoff = Math.max(leftlist) - Math.max(rightlist);
        eqn_boxes.each(function (i) {
          $(this).children(".katex").css({"margin-left":bigoff+offlist[i]});
        });
      }
      new_equation = true;
    });

    // recalculate sections
    if (!defer) {
      if (new_section) {
        number_sections();
      }
      if (new_equation) {
        number_equations();
      }
      resolve_references(box);
    }
  }

  save_cell = function(cell) {
    var cid = cell.attr("cid");
    var body = cell.attr("base_text");
    var msg = JSON.stringify({"cmd": "save", "content": {"cid":cid, "body": body}});
    console.log(msg);
    ws.send(msg);
    elltwo_box.addClass("modified");
  }

  create_cell = function(cell) {
    var newid = Math.max.apply(null,$("div.para_outer").map(function() { return $(this).attr("cid"); }).toArray()) + 1;
    var prev = cell.attr("cid");
    var next = cell.attr("next");
    var cnext = $("div.para_outer[cid="+next+"]");
    cnext.attr("prev",newid);
    cell.attr("next",newid);
    var par = make_para("Text",newid,prev,next,true);
    par.insertAfter(cell);
    var inner = par.children(".para_inner");
    select_all(inner[0]);
    var msg = JSON.stringify({"cmd": "create", "content": {"newid": newid, "prev": prev, "next": next}});
    console.log(msg);
    ws.send(msg);
    elltwo_box.addClass("modified");
  }

  delete_cell = function(cell) {
    prev = cell.attr("prev");
    next = cell.attr("next");
    cprev = $("div.para_outer[cid="+prev+"]");
    cnext = $("div.para_outer[cid="+next+"]");
    cprev.attr("next",next);
    cnext.attr("prev",prev);
    cell.remove();
    var cid = cell.attr("cid");
    var msg = JSON.stringify({"cmd": "delete", "content": {"cid": cid, "prev": prev, "next": next}});
    console.log(msg);
    ws.send(msg);
    elltwo_box.addClass("modified");
  }

  make_para = function(text,cid,prev,next,edit,defer) {
    edit = edit || false;
    defer = defer || false;

    if (text.includes("\n")) {
      text = "<div>" + text.replace(/\n/g,"</div><div>") + "</div>";
    }
    var outer = $("<div>",{class:"para_outer", cid: cid, prev: prev, next: next});
    var inner = $("<div>",{html:text, class:"para_inner"});
    outer.attr("base_text",text);
    render(inner,defer);
    inner.dblclick(function(event) {
      if (!outer.hasClass("editing") && elltwo_box.hasClass("editing")) {
        outer.attr("disp_html",inner.html());
        outer.addClass("editing");
        inner.html(outer.attr("base_text"));
        inner.attr("contentEditable","true");
        inner.focus();
      }
    });
    inner.keydown(function(event) {
      if (outer.hasClass("editing")) {
        if ((event.keyCode == 13) && event.shiftKey) {
          var text = inner.html();
          text = text.replace(/<div>/g,"\n").replace(/<\/div>/g,"").replace(/<span .*><\/span>/g,"").trim();
          outer.attr("base_text",text);
          console.log(text);
          if (outer.hasClass("modified")) {
            save_cell(outer);
            outer.removeClass("modified");
          }
          outer.removeClass("editing");
          inner.attr("contentEditable","false");
          render(inner);
          event.preventDefault();
        }
        if (event.keyCode == 27) {
          outer.removeClass("editing");
          outer.removeClass("modified");
          inner.attr("contentEditable","false");
          inner.html(outer.attr("disp_html"));
        }
      }
    });
    inner.bind("input", function() {
      outer.addClass("modified");
    });
    inner.on("focus.setcursor", function() {
      console.log('focus!');
      window.setTimeout(function() {
          var range = document.createRange();
          range.selectNodeContents(inner[0]);
          range.collapse(false);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          inner.unbind('focus.setcursor');
      }, 1);
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

  number_sections = function() {
    console.log('numbering sections');
    var sec_num = Array();
    sec_num[0] = "";
    sec_num[1] = 1;
    $("div.section_title").each(function() {
      var sec = $(this);
      var lvl = parseInt(sec.attr("sec-lvl"));
      var lab = sec_num.slice(1,lvl+1).reverse().join('.');
      sec.attr("sec_num",lab);
      sec_num[lvl]++;
      sec_num[lvl+1] = 1;
    });
  };

  number_equations = function() {
    console.log('numbering equations');
    eqn_num = 1;  
    $("div.equation.numbered").each(function() {
      var eqn = $(this);
      var num = eqn.children(".equation_number");
      eqn.attr("eqn_num",eqn_num);
      num.html(eqn_num);
      eqn_num++;
    });
  };

  resolve_references = function() {
    console.log('resolving references');
    $("span.reference").each(function() {
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
  };
};

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
    number_equations();
  }
  resolve_references();
}

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
            var div = $("<div>",{cid: c["cid"], prev: c["prev"], next: c["next"], html: c["body"], class: "par", editing: "false"});
            outer_box.append(div);
          }
          full_render();
        }
      }
    };

    ws.onclose = function() {
      console.log('websocket closed');
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
