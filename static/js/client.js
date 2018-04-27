var client = (function() {

var canary_freq = 5000;

var opened = false;
var ws;

// keep alive magic
function keep_alive() {
    // console.log("heartbeet");
    if (ws.readyState == ws.CLOSED) {
        console.log('reconnecting');
        editor.recv_command("canary", "connecting")
        delete(ws);
        connect();
    }
    timeoutID = window.setTimeout(keep_alive, [canary_freq]);
}

function send_command(cmd, cont) {
    if (cont == undefined) cont = "";
    var msg = JSON.stringify({"cmd": cmd, "content": cont});
    ws.send(msg);
}

// websockets
function connect(path) {
    if ("MozWebSocket" in window) {
        WebSocket = MozWebSocket;
    }
    if ("WebSocket" in window) {
        var ws_con = "ws://" + window.location.host + "/__elledit/" + path;
        // console.log(ws_con);

        ws = new WebSocket(ws_con);

        ws.onopen = function() {
            console.log("websocket connected!");
            editor.recv_command("canary", "connected");
            if (!opened) {
                send_command("fetch");
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
                if ((cmd == "fetch") || (cmd == "readonly")) {
                    opened = true;
                }
                editor.recv_command(cmd, cont);
            }
        };

        ws.onclose = function() {
            console.log('websocket closed.');
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

function init(targ, path, config) {
    editor.init(targ, config, send_command);
    connect(path);
}

return {
    init: init
}

})();
