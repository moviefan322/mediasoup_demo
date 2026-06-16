const os = require("os"); // operating system module
const mediasoup = require("mediasoup"); // media soup module
const totalThreads = os.cpus().length; // max number of allowed workers
console.log(`Total threads available: ${totalThreads}`);
const config = require("./config/config"); // get our config file

const createWorkers = () =>
  new Promise(async (resolve, reject) => {
    let workers = [];
    // loop to create workers based on number of threads
    for (let i = 0; i < totalThreads; i++) {
      const worker = await mediasoup.createWorker({
        trcMinPort: config.workerSettings.rtcMinPort,
        trcMaxPort: config.workerSettings.rtcMaxPort,
        logLevel: config.workerSettings.logLevel,
        logTags: config.workerSettings.logTags,
      });
      worker.on("died", () => {
        // this should never happen
        console.log("mediasoup worker has died");
        process.exit(1); // kill node program
      });
      workers.push(worker);
    }

    resolve(workers);
  });

module.exports = createWorkers;
