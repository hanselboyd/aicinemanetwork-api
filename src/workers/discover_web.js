const { runWebDiscovery } = require("../discovery/web/runWebDiscovery");

runWebDiscovery()
  .then((result) => {
    console.log("Web discovery complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Web discovery failed:", error);
    process.exit(1);
  });
