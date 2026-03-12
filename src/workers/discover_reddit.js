const { runRedditDiscovery } = require("../discovery/reddit/runRedditDiscovery");

runRedditDiscovery()
  .then((result) => {
    console.log("Reddit discovery complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Reddit discovery failed:", error);
    process.exit(1);
  });
