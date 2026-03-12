const { VIMEO_DISCOVERY_QUERIES } = require("./queries");
const { searchVimeoVideos } = require("./vimeoClient");
const { ingestVimeoResult } = require("./ingestVimeoResult");
const { createCrawlRun, finishCrawlRun } = require("../shared/crawlRuns");

async function runVimeoDiscovery() {
  const crawlRun = await createCrawlRun({
    sourcePlatform: "vimeo",
    query: "batch_discovery"
  });

  let total = 0;
  let accepted = 0;

  try {
    for (const query of VIMEO_DISCOVERY_QUERIES) {
      console.log(`[runVimeoDiscovery] Searching for: ${query}`);
      const results = await searchVimeoVideos(query);

      for (const item of results) {
        total += 1;
        const ok = await ingestVimeoResult(item, query);
        if (ok) {
          accepted += 1;
        }
      }
    }

    await finishCrawlRun(crawlRun.id, "completed", {
      total,
      accepted,
      queriesRun: VIMEO_DISCOVERY_QUERIES.length
    });

    return {
      total,
      accepted,
      queriesRun: VIMEO_DISCOVERY_QUERIES.length
    };
  } catch (error) {
    await finishCrawlRun(crawlRun.id, "failed", {
      total,
      accepted,
      queriesRun: VIMEO_DISCOVERY_QUERIES.length,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  runVimeoDiscovery
};
