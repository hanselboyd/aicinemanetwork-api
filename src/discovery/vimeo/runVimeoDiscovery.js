const { VIMEO_DISCOVERY_QUERIES } = require("./queries");
const { searchVimeoVideos } = require("./vimeoClient");
const { ingestVimeoResult } = require("./ingestVimeoResult");
const { createCrawlRun, finishCrawlRun } = require("../shared/crawlRuns");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Delay between discovery queries to spread API load
const INTER_QUERY_DELAY_MS = 3000;

async function runVimeoDiscovery() {
  const crawlRun = await createCrawlRun({
    sourcePlatform: "vimeo",
    query: "batch_discovery"
  });

  let total = 0;
  let accepted = 0;
  let queriesCompleted = 0;
  let rateLimitHit = false;

  try {
    for (let i = 0; i < VIMEO_DISCOVERY_QUERIES.length; i++) {
      const query = VIMEO_DISCOVERY_QUERIES[i];

      // Delay between queries (skip before the first one)
      if (i > 0) {
        await sleep(INTER_QUERY_DELAY_MS);
      }

      console.log(
        `[runVimeoDiscovery] Searching (${i + 1}/${VIMEO_DISCOVERY_QUERIES.length}): ${query}`
      );

      let results;
      try {
        results = await searchVimeoVideos(query, { perPage: 10 });
      } catch (searchErr) {
        if (searchErr.isRateLimit) {
          console.warn(
            `[runVimeoDiscovery] Rate-limited on search for "${query}". Stopping gracefully with partial results.`
          );
          rateLimitHit = true;
          break;
        }
        throw searchErr;
      }

      for (const item of results) {
        total += 1;
        try {
          const ok = await ingestVimeoResult(item, query);
          if (ok) {
            accepted += 1;
          }
        } catch (ingestErr) {
          if (ingestErr.isRateLimit) {
            console.warn(
              `[runVimeoDiscovery] Rate-limited during enrichment. Stopping gracefully with partial results.`
            );
            rateLimitHit = true;
            break;
          }
          // Log non-rate-limit ingest errors but continue with remaining items
          console.error(
            `[runVimeoDiscovery] Ingest error for ${item.url}: ${ingestErr.message}`
          );
        }
      }

      if (rateLimitHit) break;
      queriesCompleted += 1;
    }

    // Partial ingest is still a success — record what we got
    const finalStatus = rateLimitHit ? "partial" : "completed";

    await finishCrawlRun(crawlRun.id, finalStatus, {
      total,
      accepted,
      queriesRun: VIMEO_DISCOVERY_QUERIES.length,
      queriesCompleted,
      rateLimitHit
    });

    console.log(
      `[runVimeoDiscovery] Finished (${finalStatus}): ${accepted}/${total} accepted, ${queriesCompleted}/${VIMEO_DISCOVERY_QUERIES.length} queries`
    );

    return {
      total,
      accepted,
      queriesRun: VIMEO_DISCOVERY_QUERIES.length,
      queriesCompleted,
      rateLimitHit
    };
  } catch (error) {
    // True failures (not rate limits) — still record partial progress
    await finishCrawlRun(crawlRun.id, "failed", {
      total,
      accepted,
      queriesRun: VIMEO_DISCOVERY_QUERIES.length,
      queriesCompleted,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  runVimeoDiscovery
};
