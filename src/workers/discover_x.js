const { runXDiscovery } = require("../discovery/x/runXDiscovery");

runXDiscovery()
  .then((result) => {
    console.log("X discovery complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("X discovery failed:", error);
    process.exit(1);
  });
