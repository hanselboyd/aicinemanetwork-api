const { YOUTUBE_DISCOVERY_QUERIES } = require("./queries");
const { searchYouTubeVideos } = require("./youtubeClient");
const { ingestYouTubeResult } = require("./ingestYouTubeResult");
const { createCrawlRun, finishCrawlRun } = require("../shared/crawlRuns");

async function runYoutubeDiscovery() {
  const crawlRun = await createCrawlRun({
    sourcePlatform: "youtube",
    query: "batch_discovery"
  });

  let total = 0;
  let accepted = 0;

  try {
    for (const query of YOUTUBE_DISCOVERY_QUERIES) {
      const results = await searchYouTubeVideos(query);

      for (const item of results) {
        total += 1;
        const ok = await ingestYouTubeResult(item, query);
        if (ok) {
          accepted += 1;
        }
      }
    }

    await finishCrawlRun(crawlRun.id, "completed", {
      total,
      accepted,
      queriesRun: YOUTUBE_DISCOVERY_QUERIES.length
    });

    return {
      total,
      accepted,
      queriesRun: YOUTUBE_DISCOVERY_QUERIES.length
    };
  } catch (error) {
    await finishCrawlRun(crawlRun.id, "failed", {
      total,
      accepted,
      queriesRun: YOUTUBE_DISCOVERY_QUERIES.length,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  runYoutubeDiscovery
};
