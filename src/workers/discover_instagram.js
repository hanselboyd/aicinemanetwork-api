const { runInstagramDiscovery } = require("../discovery/instagram/runInstagramDiscovery");

runInstagramDiscovery()
  .then((result) => {
    console.log("Instagram discovery complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Instagram discovery failed:", error);
    process.exit(1);
  });
