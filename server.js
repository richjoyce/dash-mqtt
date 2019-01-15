require("dotenv").config()
const sni = require("sni");
const net = require("net");
const itch = require("is-tls-client-hello");
const mqtt = require("mqtt");
/* if log file path given set up logger to send there and (always) stdout */
const log = require("simple-node-logger").createSimpleLogger(process.argv.length > 2 ? process.argv[2] : undefined);

/* Load environment variable options */
const port = process.env.PORT || 443;
const addr = process.env.ADDR || "0.0.0.0";
const mqtt_args = {
  hostname: process.env.MQTT_HOST,
  port: process.env.MQTT_PORT || 1883,
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  reconnectPeriod: 5000
};
var mqtt_topic_base = process.env.MQTT_TOPIC_BASE || "dash/"
if (mqtt_topic_base.substr(-1) != '/') {
  mqtt_topic_base += '/';
}

/* Only required config variable is MQTT hostname */
if (!mqtt_args.hostname) {
  // Can't use 'log' as it's slightly async so no error gets printed before exit
  console.log("[↑] Need to specify environment variable MQTT_HOST; exiting.");
  process.exit(1);
}

/* Records (IP -> time) where IP is the IP of a Dash button and
 * time is the last time we got a ClientHello from it.
 * This is used because Dash buttons send 2 requests back to back
 * each time the button is pressed, so we ignore the second. */
var dashSeenMap = new Map();

/* Ignore packets that come within this time to avoid the above */
const dashButtonTimeout = 5000; // msec

/* Connect to mqtt broker */
log.info("[↑][i] Connecting to MQTT broker at " + mqtt_args.hostname + ":" + mqtt_args.port + "...");
var client = mqtt.connect(mqtt_args);

/* MQTT client callbacks */
client.on('connect', () => { log.info("[↑][✓] Connected to MQTT broker!"); });
client.on('reconnect', () => { log.warn("[↑][⟳] Lost connection, attempting reconnection to MQTT broker at " + mqtt_args.hostname + ":" + mqtt_args.port); });
client.on('error', (error) => { log.error("[↑][✗] MQTT connection error: " + error); });
client.on('close', () => { log.error("[↑][✗] MQTT connection closed, will attempt reconnection."); });

/* Listen for Dash button TLS packets */
var tls_server = net.createServer(function(socket) {
  /* Get IP address */
  address = socket.remoteAddress;

  socket.on("data", function(data) {
    log.debug("[↓] Data from " + address);

    /* Check if data is a TLS client hello */
    if (!itch(data)) {
      log.info("[↓][✗] Invalid packet from " + address + " ignored.");
      socket.end();
      return;
    }

    /* Try to extract hostname */
    hostname = sni(data);
    if (!hostname) {
      log.info("[↓][✗] No SNI in packet from " + address + ", ignored.");
      socket.end();
      return;
    }

    /* Check that it is a dash button sending the request */
    isDash = hostname === "dash-button-na-aws-opf.amazon.com";
    if (!isDash) {
      log.info("[↓][✗] SNI host \"" + hostname + "\" ignored (not dash button?).");
      socket.end();
      return;
    }

    /* Check if this is the second press */
    lastSeen = dashSeenMap.get(address);
    dashSeenMap.set(address, new Date());

    if (lastSeen != undefined && new Date() - lastSeen < dashButtonTimeout) {
      log.info("[↓][i] Second request from " + address + " ignored.");
      socket.end();
      return;
    }

    /* We got a valid dash button press! And it's the first! Let's ship it */
    log.info("[↓][✓] Dash Button at " + address + " pressed!");

    if (client.connected) {
      client.publish(mqtt_topic_base + address, 'press');
      log.info("[↓][→][↑][✓] Dash Button published 'press' to '" + mqtt_topic_base + address + "'");
    } else {
      log.error("[↓][→][↑][✗] No MQTT connection: could not report button press!");
    }

    socket.end();
    return;

  });

  socket.on("error", function(error) { log.error("[↓][E] Socket error (from " + address + "): " + error); });
  socket.on("close", function(error) { log.debug("[↓][i] Socket from " + address + " closed."); });
});

tls_server.on('error', function(error) {
  var err_msg;
  if (error.code === 'EADDRINUSE') {
    err_msg = "[↓][E] Address in use when attempting to listen on " + addr + ":" + port + " (" + error + ")";
  } else if (error.code === 'EACCES') {
    err_msg = "[↓][E] Permission denied when attempting to listen on " + addr + ":" + port + " (" + error + ")";
  } else {
    err_msg = "[↓][E] Error with TCP server: " + error;
  }

  /* Exit if we are no longer listening after this error (or never were) */
  /* log the error using console if about to quit, otherwise use logging module */
  if (!tls_server.listening) {
    console.log(err_msg);
    process.exit(2);
  } else {
    log.error(err_msg);
  }
});

tls_server.on('listening', function() { log.info("[↓][i] Listening for Dash Button packets on " + addr + ":" + port); });
tls_server.on('close', function() {
  console.log("[↓][E] Socket unexpectedly closed. Exiting.");
  process.exit(3);
});

tls_server.listen(port, addr);
