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

//  our globals
// where media soup workers live
let workers = null;
// init router, it's where our 1 router will live
let router = null;

// prep mediaSoup
const initMediaSoup = async () => {
  workers = await createWorkers();
  //   console.log(workers)
  router = await workers[0].createRouter({
    mediaCodecs: config.routerMediaCodecs,
  });
};

initMediaSoup(); // build our mediasoup server/sfu

// socketIO listeners
io.on("connect", (socket) => {
  let thisClientProducerTransport = null;
  let thisClientProducer = null;

  // socket is the client that just connected
  socket.on("getRtpCap", (ack) => {
    // ack is callback to run, sends back to client
    ack(router.rtpCapabilities);
  });

  socket.on("create-producer-transport", async (ack) => {
    // create a transport! producer transport
    thisClientProducerTransport = await router.createWebRtcTransport({
      enableUdp: true,
      enableTcp: true, // always use udp unless we can't
      preferUdp: true,
      listenInfos: [
        {
          protocol: "udp",
          ip: "127.0.0.1",
        },
        {
          protocol: "tcp",
          ip: "127.0.0.1",
        },
      ],
    });
    console.log("Producer transport created: ", thisClientProducerTransport.id);
    const clientTransportParams = {
      id: thisClientProducerTransport.id,
      iceParameters: thisClientProducerTransport.iceParameters,
      iceCandidates: thisClientProducerTransport.iceCandidates,
      dtlsParameters: thisClientProducerTransport.dtlsParameters,
    };
    ack(clientTransportParams); //what we send back
  });
  socket.on("connect-transport", async (dtlsParamters, ack) => {
    //  get the dts info from the client and finish the connection
    // on success, send success, on fail, send error
    try {
      await thisClientProducerTransport.connect(dtlsParamters);
      ack("success");
    } catch (err) {
      // something went wrong
      console.log("connect-transport error: ", err);
      ack("error");
    }
  });

  socket.on("start-producing", async ({ kind, rtpParameters }, ack) => {
    try {
      thisClientProducer = await thisClientProducerTransport.produce({
        kind,
        rtpParameters,
      });
      ack(thisClientProducer.id);
    } catch (err) {
      console.log(err);
      ack("error");
    }
  });
});

httpsServer.listen(config.port);
