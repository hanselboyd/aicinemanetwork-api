const { WEB_DISCOVERY_QUERIES } = require("./queries");
const { searchWebPages } = require("./webSearchClient");
const { ingestWebResult } = require("./ingestWebResult");
const { createCrawlRun, finishCrawlRun } = require("../shared/crawlRuns");

async function runWebDiscovery() {
  const crawlRun = await createCrawlRun({
    sourcePlatform: "web",
    query: "batch_discovery"
  });

  let total = 0;
  let accepted = 0;
  let contactsFound = 0;

  try {
    for (const query of WEB_DISCOVERY_QUERIES) {
      console.log(`[runWebDiscovery] Searching for: ${query}`);
      const results = await searchWebPages(query);

      for (const item of results) {
        total += 1;
        const result = await ingestWebResult(item, query);
        if (result.accepted) {
          accepted += 1;
          contactsFound += result.contactsFound || 0;
        }
      }
    }

    await finishCrawlRun(crawlRun.id, "completed", {
      total,
      accepted,
      contactsFound,
      queriesRun: WEB_DISCOVERY_QUERIES.length
    });

    return {
      total,
      accepted,
      contactsFound,
      queriesRun: WEB_DISCOVERY_QUERIES.length
    };
  } catch (error) {
    await finishCrawlRun(crawlRun.id, "failed", {
      total,
      accepted,
      contactsFound,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  runWebDiscovery
};
