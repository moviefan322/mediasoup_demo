//  Globals
let socket = null;
let device = null;
let localStream = null;
let producerTransport = null;
let producer = null;

const initConnect = () => {
  //   console.log("connect button clicked");
  socket = io(`https://localhost:3030`);
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
    console.log('id: ', resp);
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

// socket listeners here!
function addSocketListeners() {
  socket.on("connect", () => {
    // this will auto trigger on connection
    connectButton.innerHTML = "Connected";
    connectButton.disabled = true;
    deviceButton.disabled = false;
  });
}
