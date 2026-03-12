const { X_DISCOVERY_QUERIES } = require("./queries");
const { searchXPosts } = require("./xClient");
const { ingestXResult } = require("./ingestXResult");
const { createCrawlRun, finishCrawlRun } = require("../shared/crawlRuns");

async function runXDiscovery() {
  const crawlRun = await createCrawlRun({
    sourcePlatform: "x",
    query: "batch_discovery"
  });

  let total = 0;
  let accepted = 0;
  let creatorsCreated = 0;

  try {
    for (const query of X_DISCOVERY_QUERIES) {
      console.log(`[runXDiscovery] Searching for: ${query}`);
      const results = await searchXPosts(query);

      for (const item of results) {
        total += 1;
        const result = await ingestXResult(item, query);
        if (result.accepted) {
          accepted += 1;
          if (result.creatorCreated) {
            creatorsCreated += 1;
          }
        }
      }
    }

    await finishCrawlRun(crawlRun.id, "completed", {
      total,
      accepted,
      creatorsCreated,
      queriesRun: X_DISCOVERY_QUERIES.length
    });

    return {
      total,
      accepted,
      creatorsCreated,
      queriesRun: X_DISCOVERY_QUERIES.length
    };
  } catch (error) {
    await finishCrawlRun(crawlRun.id, "failed", {
      total,
      accepted,
      creatorsCreated,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  runXDiscovery
};
