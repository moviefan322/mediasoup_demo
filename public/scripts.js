//  Globals
let socket = null;
let device = null;
let localStream = null;
let producerTransport = null;
let producer = null;
let consumerTransport = null;
let consumer = null;

const initConnect = () => {
  //   console.log("connect button clicked");
  socket = io();
  //   keep the socket listeners in their own place
  addSocketListeners();
};

const deviceSetup = async () => {
  //   console.log(mediasoupClient);
  device = new mediasoupClient.Device();
  //    now load
  const routerRtpCapabilities = await socket.emitWithAck("getRtpCap");
  await device.load({ routerRtpCapabilities });
  //   console.log(device.loaded);
  deviceButton.disabled = true;
  createProdButton.disabled = false;
  createConsButton.disabled = false;
  disconnectButton.disabled = false;
};

const createProducer = async () => {
  // console.log("create producer clicked");
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.log("GUM ERROR!", err);
  }
  // ask the socket.io server (signaling) for transport information
  const data = await socket.emitWithAck("create-producer-transport");
  const { id, iceParameters, iceCandidates, dtlsParameters } = data;
  // console.log(data);
  // make a transport on the client (producer)
  const transport = device.createSendTransport({
    id,
    iceParameters,
    iceCandidates,
    dtlsParameters,
  });
  producerTransport = transport; // set global for later use
  // the transport connect event will not fire until
  //  we call transport.producer()
  producerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      // console.log("transport connect event has fired!");
      // connect comes with local dtlsParamters
      // we need to send those to the server
      // to connect the server side transport
      console.log("dtlsParameters", dtlsParameters);
      try {
        const resp = await socket.emitWithAck("connect-transport", {
          dtlsParameters,
        });
        if (resp === "success") {
          // calling callback simply lets app know server
          // succeeded in connecting, so trigger produce event
          callback();
        } else if (resp === "error") {
          // calling errback simply lets app know server
          // failed in connecting, so HALT everything
          errback();
        }
        // console.log("connect-transport response", resp);
      } catch (err) {
        console.log("connect-transport error", err);
      }
    },
  );
  producerTransport.on("produce", async (parameters, callback, errback) => {
    console.log("transport produce event has fired!");
    const { kind, rtpParameters } = parameters;
    const resp = await socket.emitWithAck("start-producing", {
      kind,
      rtpParameters,
    });
    console.log("id: ", resp);
    if (resp === "error") {
      // something went wrrong
      errback();
    } else {
      // resp contains an id
      callback({ id: resp });
    }
    publishButton.disabled = true;
    createConsButton.disabled = false;
  });
  createProdButton.disabled = true;
  publishButton.disabled = false;
};

const publish = async () => {
  // console.log("publish button clicked");
  const track = localStream.getVideoTracks()[0]; // just video for now
  producer = await producerTransport.produce({ track });
};

const createConsumer = async () => {
  const data = await socket.emitWithAck("create-consumer-transport");
  const { id, iceParameters, iceCandidates, dtlsParameters } = data;
  // console.log(data);
  // make a transport on the client (producer)
  const transport = device.createRecvTransport({
    id,
    iceParameters,
    iceCandidates,
    dtlsParameters,
  });
  consumerTransport = transport; // set global for later use
  consumerTransport.on("connectionstatechange", (state) => {
    console.log("Consumer transport connection state changed to:", state);
  });
  consumerTransport.on("icegatheringstatechange", (state) => {
    console.log("...ice gathering change...:", state);
  });
  // the transport connect event will not fire until
  //  we call transport.consume()
  consumerTransport.on(
    "connect",
    async ({ dtlsParameters }, callback, errback) => {
      // console.log("transport connect event has fired!");
      // connect comes with local dtlsParamters
      // we need to send those to the server
      // to connect the server side transport
      console.log("dtlsParameters", dtlsParameters);
      try {
        const resp = await socket.emitWithAck("connect-consumer-transport", {
          dtlsParameters,
        });
        if (resp === "success") {
          // calling callback simply lets app know server
          // succeeded in connecting, so trigger produce event
          callback();
        } else if (resp === "error") {
          // calling errback simply lets app know server
          // failed in connecting, so HALT everything
          errback();
        }
        // console.log("connect-transport response", resp);
      } catch (err) {
        console.log("connect-transport error", err);
      }
    },
  );

  createConsButton.disabled = true;
  consumeButton.disabled = false;
};

const consume = async () => {
  console.log("consume button clicked");
  // emit consume-media event this will get us back the
  // "stuff" that we need to make a consumer, and get the video track
  const consumerParams = await socket.emitWithAck("consume-media", {
    rtpCapabilities: device.rtpCapabilities,
  });
  if (consumerParams === "noProducer") {
    console.log("There is no producer set up to consume");
  } else if (consumerParams === "cannotConsume") {
    console.log("Rtp capabilities failed. Cannot consume");
  } else {
    // set up our consumer and add the video to the video tag
    consumer = await consumerTransport.consume(consumerParams);
    const { track } = consumer;
    console.log(track);

    // listen for various track events:
    track.addEventListener("ended", () => {
      console.log("track ended");
    });

    track.onmute = (event) => {
      console.log("track muted");
    };

    track.onunmute = (event) => {
      console.log("track unmuted");
    };

    // see MDN on MediaStream for info on MediaStream
    remoteVideo.srcObject = new MediaStream([track]);
    console.log("Track is ready.... we need to unpause");
    await socket.emitWithAck("unpause-consumer");
  }
};

const disconnect = async () => {
  // close everything, right now
  // send a message to ther server, then close here
  const closedResp = await socket.emitWithAck("close-all");
  if (closeResp === "closeError") {
    console.log("something went wrong closing transports");
  }
  // it doesn't matter if the server didn't close
  // we still close
  producerTransport?.close();
  consumerTransport?.close();
};

// socket listeners here!
function addSocketListeners() {
  socket.on("connect", () => {
    // this will auto trigger on connection
    connectButton.innerHTML = "Connected";
    connectButton.disabled = true;
    deviceButton.disabled = false;
  });
}
