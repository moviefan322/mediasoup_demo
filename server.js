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
const createWebRtcTransportBothKinds = require("./public/createWebRtcTransportBothKinds");

const io = socketio(httpsServer, {
  cors: [`https://204.48.17.220:${config.port}`],
});

//  our globals
// where media soup workers live
let workers = null;
// init router, it's where our 1 router will live
let router = null;
// theProducer will be a global, and whoever produced last
let theProducer = null;

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
  let thisClientConsumerTransport = null;
  let thisClientConsumer = null;

  // socket is the client that just connected
  socket.on("getRtpCap", (ack) => {
    // ack is callback to run, sends back to client
    ack(router.rtpCapabilities);
  });

  socket.on("create-producer-transport", async (ack) => {
    // create a transport! producer transport
    const { transport, clientTransportParams } =
      await createWebRtcTransportBothKinds(router);
    thisClientProducerTransport = transport; // save to this socket session
    ack(clientTransportParams); //what we send back
  });

  socket.on("start-producing", async ({ kind, rtpParameters }, ack) => {
    try {
      thisClientProducer = await thisClientProducerTransport.produce({
        kind,
        rtpParameters,
      });
      theProducer = thisClientProducer; // set global producer to this producer
      thisClientProducer.on("transportclose", () => {
        console.log("producer transport closed just fyi");
        thisClientProducer.close();
      });
      ack(thisClientProducer.id);
    } catch (err) {
      console.log(err);
      ack("error");
    }
  });

  socket.on("create-consumer-transport", async (ack) => {
    // create a transport! producer transport
    const { transport, clientTransportParams } =
      await createWebRtcTransportBothKinds(router);
    thisClientConsumerTransport = transport; // save to this socket session
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

  socket.on("connect-consumer-transport", async (dtlsParamters, ack) => {
    //  get the dts info from the client and finish the connection
    // on success, send success, on fail, send error
    try {
      await thisClientConsumerTransport.connect(dtlsParamters);
      ack("success");
    } catch (err) {
      // something went wrong
      console.log("connect-transport error: ", err);
      ack("error");
    }
  });

  socket.on("consume-media", async ({ rtpCapabilities }, ack) => {
    // we will set up our client consumer, and send back
    // the params the client needs to do the same
    // make sure there is a producer :) we can't consume without one
    if (!theProducer) {
      ack("noProducer");
    } else if (
      !router.canConsume({ producerId: theProducer.id, rtpCapabilities })
    ) {
      ack("cannotConsume");
    } else {
      // we can consume, there is a producer and client is able
      // proceed!
      thisClientConsumer = await thisClientConsumerTransport.consume({
        producerId: theProducer.id,
        rtpCapabilities,
        paused: true, // see docs, docs is the best way to start
      });
      thisClientConsumer.on("transportclose", () => {
        console.log("consumer transport closed just fyi");
        thisClientConsumer.close();
      });
      const consumerParams = {
        producerId: theProducer.id,
        id: thisClientConsumer.id,
        kind: thisClientConsumer.kind,
        rtpParameters: thisClientConsumer.rtpParameters,
      };
      ack(consumerParams);
    }
  });

  socket.on("unpause-consumer", async (ack) => {
    await thisClientConsumer.resume();
  });

  socket.on("close-all", async (ack) => {
    // client has requested to close all
    try {
      thisClientConsumerTransport?.close();
      thisClientProducerTransport?.close();
    } catch (error) {
      ack("closeError");
    }
  });
});

httpsServer.listen(config.port);
