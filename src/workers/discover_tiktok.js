const { runTikTokDiscovery } = require("../discovery/tiktok/runTikTokDiscovery");

runTikTokDiscovery()
  .then((result) => {
    console.log("TikTok discovery complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("TikTok discovery failed:", error);
    process.exit(1);
  });
