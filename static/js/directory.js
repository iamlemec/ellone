// Elltwo editor

function make_entry(type,target,name) {
  var entry = $("<div>",{class:"entry"});
  entry.addClass(type);
  var href = "/" + target + "/" + relpath + name;
  var link = $("<a>",{href:href,html:name});
  entry.append(link);
  var del = $("<div>",{class:"delbox",html:"&#x2715;"});
  del.click(function() {
    result = window.confirm('Are you sure you want to delete ' + name + '?');
    if (result) {
      var msg = JSON.stringify({"cmd": "delete", "content": name});
      ws.send(msg);
    }
  });
  entry.append(del);
  return entry;
}

function connect()
{
  if ('MozWebSocket' in window) {
    WebSocket = MozWebSocket;
  }
  if ('WebSocket' in window) {
    var ws_con = "ws://" + window.location.host + "/diredit/" + relpath;
    console.log(ws_con);

    ws = new WebSocket(ws_con);

    ws.onopen = function() {
      console.log('websocket connected!');
      var msg = JSON.stringify({"cmd": "list", "content": ""});
      ws.send(msg);
    };

    ws.onmessage = function (evt) {
      var msg = evt.data;
      console.log('Received: ' + msg);

      var json_data = JSON.parse(msg);
      if (json_data) {
        var cmd = json_data['cmd'];
        var cont = json_data['content'];
        if (cmd == 'results') {
          $(".directory .entry.dir").remove();
          $(".directory .entry.doc").remove();
          $(".directory .entry.misc").remove();
          $(cont['dirs']).each(function (i,name) {
            var entry = make_entry("dir","directory",name);
            entry.insertBefore(tools);
          });
          $(cont['docs']).each(function (i,name) {
            var entry = make_entry("doc","editor",name);
            entry.insertBefore(tools);
          });
          $(cont['misc']).each(function (i,name) {
            var entry = make_entry("misc","local",name);
            entry.insertBefore(tools);
          });
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

function initialize() {
  console.log(dirname);

  create = $(".directory .create");
  tools = $(".directory .tools");

  if (relpath.length == 0) {
    relpath = "";
  } else {
    relpath = relpath + "/";
  }

  create.click(function() {
    var entry = $("<div>",{class: "entry"});
    var input = $("<input>");
    input.keydown(function(event) {
      if (event.keyCode == 13) {
        var name = input.val();
        entry.remove();
        var msg = JSON.stringify({"cmd": "create", "content": name});
        ws.send(msg);
      }
    });
    entry.append(input);
    entry.insertBefore(tools);
    input.focus();
  });

  $(".upload").click(function() {
    $('#fake-input').click();
  });

  $("#fake-input").change(function() {
    $("#fake-form").submit();
  });

  $("#fake-form").submit(function() {
    event.preventDefault();
    var formData = new FormData($(this)[0]);

    $.ajax({
      url: '/upload/' + dirname,
      type: 'POST',
      data: formData,
      contentType: false,
      processData: false,
      cache: false,
      success: function (resp) {
        var msg = JSON.stringify({"cmd": "list", "content": ""});
        ws.send(msg);
      },
      error: function(resp) {
        alert(resp);
      }
    });

    return false;
  });
}

$(document).ready(function() {
  initialize();
  connect();
});
