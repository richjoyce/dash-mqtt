var sni = require("sni");
var net = require("net");
var net = require("net");
var itch = require("is-tls-client-hello");

net.createServer(function(socket) {
    socket.on("data", function(data) {
        if (itch(data)) {
            hostname = sni(data);
            if (hostname) {
                console.log(hostname);
            } else {
                console.log("No SNI data.");
            }
        } else {
            console.log("Got invalid packet.");
        }
        socket.end();
    });
}).listen(9660);
