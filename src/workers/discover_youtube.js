const { runYoutubeDiscovery } = require("../discovery/youtube/runYoutubeDiscovery");

runYoutubeDiscovery()
  .then((result) => {
    console.log("YouTube discovery complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("YouTube discovery failed:", error);
    process.exit(1);
  });
