const { runVimeoDiscovery } = require("../discovery/vimeo/runVimeoDiscovery");

runVimeoDiscovery()
  .then((result) => {
    console.log("Vimeo discovery complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Vimeo discovery failed:", error);
    process.exit(1);
  });
