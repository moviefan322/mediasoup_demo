const ANNOUNCED_ADDRESS =
  process.env.MEDIASOUP_ANNOUNCED_ADDRESS || "127.0.0.1";

const createWebRtcTransportBothKinds = (router) =>
  new Promise(async (resolve, reject) => {
    const transport = await router.createWebRtcTransport({
      enableUdp: true,
      enableTcp: true, // always use udp unless we can't
      preferUdp: true,
      listenInfos: [
        {
          protocol: "udp",
          ip: "0.0.0.0",
          announcedAddress: ANNOUNCED_ADDRESS,
        },
        {
          protocol: "tcp",
          ip: "0.0.0.0",
          announcedAddress: ANNOUNCED_ADDRESS,
        },
      ],
    });
    const clientTransportParams = {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };

    resolve({ transport, clientTransportParams });
  });

module.exports = createWebRtcTransportBothKinds;
