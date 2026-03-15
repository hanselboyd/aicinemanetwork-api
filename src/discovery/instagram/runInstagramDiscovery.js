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
  let queriesCompleted = 0;
  let rateLimitHit = false;
  const seenUsernames = new Set();
  const errors = [];

  try {
    for (const query of INSTAGRAM_DISCOVERY_QUERIES) {
      console.log(`[runInstagramDiscovery] Query: "${query}"`);

      let results;
      try {
        results = await searchInstagramProfiles(query);
      } catch (err) {
        if (err.isRateLimit) {
          console.warn(
            `[runInstagramDiscovery] Rate limited at query "${query}". Stopping.`
          );
          rateLimitHit = true;
          break;
        }
        console.error(
          `[runInstagramDiscovery] Query "${query}" failed: ${err.message}`
        );
        errors.push(`${query}: ${err.message}`);
        continue;
      }

      queriesCompleted++;

      // Check if client hit IG API rate limit during enrichment
      if (results.rateLimitHit) {
        console.warn(
          `[runInstagramDiscovery] IG API rate limited at query "${query}". Processing partial results then stopping.`
        );
        rateLimitHit = true;
      }

      for (const item of results) {
        // Deduplicate across queries
        const username = (item.username || "").toLowerCase();
        if (seenUsernames.has(username)) continue;
        seenUsernames.add(username);

        total++;

        try {
          const result = await ingestInstagramResult(item, query);
          if (result.accepted) {
            accepted++;
            if (result.creatorCreated) creatorsCreated++;
          }
        } catch (err) {
          console.error(
            `[runInstagramDiscovery] Ingest error for @${username}: ${err.message}`
          );
          errors.push(`@${username}: ${err.message}`);
        }
      }

      console.log(
        `[runInstagramDiscovery] "${query}" → ${results.length} profiles, ${total} total (${accepted} accepted)`
      );

      // Stop processing more queries if rate limited
      if (rateLimitHit) {
        console.warn(
          `[runInstagramDiscovery] Stopping after ${queriesCompleted} queries due to IG rate limit.`
        );
        break;
      }
    }

    const status = rateLimitHit ? "completed" : "completed";
    const stats = {
      total,
      accepted,
      creatorsCreated,
      queriesRun: INSTAGRAM_DISCOVERY_QUERIES.length,
      queriesCompleted,
      profilesEnriched: seenUsernames.size,
      rateLimitHit: rateLimitHit || undefined,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined
    };

    await finishCrawlRun(crawlRun.id, status, stats);
    return stats;
  } catch (error) {
    await finishCrawlRun(crawlRun.id, "failed", {
      total,
      accepted,
      creatorsCreated,
      queriesRun: INSTAGRAM_DISCOVERY_QUERIES.length,
      queriesCompleted,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  runInstagramDiscovery
};
