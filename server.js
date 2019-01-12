var sni = require("sni");
var net = require("net");
var net = require("net");
var itch = require("is-tls-client-hello");
var log = require("simple-node-logger").createSimpleLogger();

/* Records (IP -> time) where IP is the IP of a Dash button and
 * time is the last time we got a ClientHello from it.
 * This is used because Dash buttons send 2 requests back to back
 * each time the button is pressed, so we ignore the second. */
var dashSeenMap = new Map();

/* Ignore packets that come within this time to avoid the above */
const dashButtonTimeout = 5000; // msec

net.createServer(function(socket) {
  socket.on("data", function(data) {
    /* Get IP address */
    address = socket.remoteAddress;
    log.debug("Data from " + address);

    /* Check if data is a TLS client hello */
    if (!itch(data)) {
      log.info("[✗] Invalid packet from " + address + " ignored.");
      socket.end();
      return;
    }

    /* Try to extract hostname */
    hostname = sni(data);
    if (!hostname) {
      log.info("[✗] No SNI in packet from " + address + ", ignored.");
      socket.end();
      return;
    }

    /* Check that it is a dash button sending the request */
    isDash = hostname === "dash-button-na-aws-opf.amazon.com";
    if (!isDash) {
      log.info("[✗] SNI host \"" + hostname + "\" ignored (not dash button?).");
      socket.end();
      return;
    }

    /* Check if this is the second press */
    lastSeen = dashSeenMap.get(address);
    dashSeenMap.set(address, new Date());

    if (lastSeen != undefined && new Date() - lastSeen < dashButtonTimeout) {
      log.info("[i] Second request from " + address + " ignored.");
      socket.end();
      return;
    }

    /* We got a valid dash button press! And it's the first! Let's ship it */
    log.info("[✓] Dash Button at " + address + " pressed!");

    socket.end();
    return;

  });
}).listen(9660, '0.0.0.0'); // listen on IPv4 so remote address are not IPv6
