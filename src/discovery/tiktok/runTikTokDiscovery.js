const { TIKTOK_DISCOVERY_QUERIES } = require("./queries");
const { searchTikTokVideos } = require("./tiktokClient");
const { ingestTikTokResult } = require("./ingestTikTokResult");
const { createCrawlRun, finishCrawlRun } = require("../shared/crawlRuns");

async function runTikTokDiscovery() {
  const crawlRun = await createCrawlRun({
    sourcePlatform: "tiktok",
    query: "batch_discovery"
  });

  let total = 0;
  let accepted = 0;
  let creatorsCreated = 0;

  try {
    for (const query of TIKTOK_DISCOVERY_QUERIES) {
      console.log(`[runTikTokDiscovery] Searching for: ${query}`);
      const results = await searchTikTokVideos(query);

      for (const item of results) {
        total += 1;
        const result = await ingestTikTokResult(item, query);
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
      queriesRun: TIKTOK_DISCOVERY_QUERIES.length
    });

    return {
      total,
      accepted,
      creatorsCreated,
      queriesRun: TIKTOK_DISCOVERY_QUERIES.length
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
  runTikTokDiscovery
};
