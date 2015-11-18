// Elltwo editor

function connect()
{
  if ('MozWebSocket' in window) {
    WebSocket = MozWebSocket;
  }
  if ('WebSocket' in window) {
    var ws_con = "ws://" + window.location.host + "/diredit/" + dirname;
    console.log(ws_con);

    ws = new WebSocket(ws_con);

    ws.onopen = function() {
      console.log('websocket connected!');
    };

    ws.onmessage = function (evt) {
      var msg = evt.data;
      console.log('Received: ' + msg);
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
  var create = $(".directory .create");
  create.click(function() {
    var entry = $("<div>",{class: "entry"});
    var input = $("<input>");
    input.keydown(function(event) {
      if (event.keyCode == 13) {
        var name = input.val();
        var link = $("<a>",{href:"/editor/"+name,html:name});
        input.replaceWith(link);
        var msg = JSON.stringify({"cmd": "create", "content": name});
        ws.send(msg);
      }
    });
    entry.append(input);
    entry.insertBefore(create);
    input.focus();
  });
}

$(document).ready(function() {
  initialize();
  connect();
});
