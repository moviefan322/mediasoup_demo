const fs = require("fs"); // need it to read keys
const https = require("https"); // need for secure express

// express sets up http server
const express = require("express");
const app = express();
app.use(express.static("public"));

// get mkcert keys
const key = fs.readFileSync("./config/cert.key");
const cert = fs.readFileSync("./config/cert.crt");
const options = { key, cert };
// use keys with https server
const httpsServer = https.createServer(options, app);

const socketio = require("socket.io");
const mediasoup = require("mediasoup");

const config = require("./config/config");
const createWorkers = require("./createWorkers");

const io = socketio(httpsServer, {
  cors: [`https://localhost:${config.port}`],
});

// where media soup workers live
let workers = null;

// prep mediaSoup
const initMediaSoup = async () => {
  workers = await createWorkers();
//   console.log(workers)
};

initMediaSoup(); // build our mediasoup server/sfu
 
httpsServer.listen(config.port);
