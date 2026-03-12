const { INSTAGRAM_DISCOVERY_QUERIES } = require("./queries");
const { searchInstagramProfiles } = require("./instagramClient");
const { ingestInstagramResult } = require("./ingestInstagramResult");
const { createCrawlRun, finishCrawlRun } = require("../shared/crawlRuns");

async function runInstagramDiscovery() {
  const crawlRun = await createCrawlRun({
    sourcePlatform: "instagram",
    query: "batch_discovery"
  });

  let total = 0;
  let accepted = 0;
  let creatorsCreated = 0;

  try {
    for (const query of INSTAGRAM_DISCOVERY_QUERIES) {
      console.log(`[runInstagramDiscovery] Searching for: ${query}`);
      const results = await searchInstagramProfiles(query);

      for (const item of results) {
        total += 1;
        const result = await ingestInstagramResult(item, query);
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
      queriesRun: INSTAGRAM_DISCOVERY_QUERIES.length
    });

    return {
      total,
      accepted,
      creatorsCreated,
      queriesRun: INSTAGRAM_DISCOVERY_QUERIES.length
    };
  } catch (error) {
    await finishCrawlRun(crawlRun.id, "failed", {
      total,
      accepted,
      creatorsCreated,
      queriesRun: INSTAGRAM_DISCOVERY_QUERIES.length,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  runInstagramDiscovery
};
