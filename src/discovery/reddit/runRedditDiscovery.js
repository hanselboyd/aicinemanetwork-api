const {
  REDDIT_DISCOVERY_QUERIES,
  REDDIT_TARGET_SUBREDDITS
} = require("./queries");
const { searchRedditPosts, getSubredditPosts } = require("./redditClient");
const { ingestRedditResult } = require("./ingestRedditResult");
const { createCrawlRun, finishCrawlRun } = require("../shared/crawlRuns");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Delay between search queries / subreddit scans to spread API load
const INTER_QUERY_DELAY_MS = 3000;

async function runRedditDiscovery() {
  const crawlRun = await createCrawlRun({
    sourcePlatform: "reddit",
    query: "batch_discovery"
  });

  let total = 0;
  let accepted = 0;
  let withVideoLinks = 0;
  let queriesCompleted = 0;
  let subredditsCompleted = 0;
  let rateLimitHit = false;
  let skippedDupes = 0;

  // Track seen post IDs to deduplicate across queries
  const seenPostIds = new Set();

  try {
    // Phase 1: Search by queries (across all of Reddit)
    for (let i = 0; i < REDDIT_DISCOVERY_QUERIES.length; i++) {
      const query = REDDIT_DISCOVERY_QUERIES[i];

      if (i > 0) {
        await sleep(INTER_QUERY_DELAY_MS);
      }

      console.log(
        `[runRedditDiscovery] Search (${i + 1}/${REDDIT_DISCOVERY_QUERIES.length}): "${query}"`
      );

      let results;
      try {
        results = await searchRedditPosts(query);
      } catch (searchErr) {
        if (searchErr.isRateLimit) {
          console.warn(
            `[runRedditDiscovery] Rate-limited on search "${query}". Stopping gracefully.`
          );
          rateLimitHit = true;
          break;
        }
        // Log non-rate-limit search errors but continue to next query
        console.error(
          `[runRedditDiscovery] Search error for "${query}": ${searchErr.message}`
        );
        continue;
      }

      for (const item of results) {
        // Deduplicate across queries
        if (seenPostIds.has(item.postId)) {
          skippedDupes += 1;
          continue;
        }
        seenPostIds.add(item.postId);

        total += 1;
        try {
          const result = await ingestRedditResult(item, query);
          if (result.accepted) {
            accepted += 1;
            if (result.hasVideoLink) {
              withVideoLinks += 1;
            }
          }
        } catch (ingestErr) {
          if (ingestErr.isRateLimit) {
            console.warn(
              `[runRedditDiscovery] Rate-limited during ingestion. Stopping gracefully.`
            );
            rateLimitHit = true;
            break;
          }
          console.error(
            `[runRedditDiscovery] Ingest error for post ${item.postId}: ${ingestErr.message}`
          );
        }
      }

      if (rateLimitHit) break;
      queriesCompleted += 1;
    }

    // Phase 2: Browse target subreddits (recent posts)
    if (!rateLimitHit) {
      for (let i = 0; i < REDDIT_TARGET_SUBREDDITS.length; i++) {
        const subreddit = REDDIT_TARGET_SUBREDDITS[i];

        await sleep(INTER_QUERY_DELAY_MS);

        console.log(
          `[runRedditDiscovery] Subreddit (${i + 1}/${REDDIT_TARGET_SUBREDDITS.length}): r/${subreddit}`
        );

        let results;
        try {
          results = await getSubredditPosts(subreddit, 25);
        } catch (subErr) {
          if (subErr.isRateLimit) {
            console.warn(
              `[runRedditDiscovery] Rate-limited on r/${subreddit}. Stopping gracefully.`
            );
            rateLimitHit = true;
            break;
          }
          console.error(
            `[runRedditDiscovery] Subreddit error for r/${subreddit}: ${subErr.message}`
          );
          continue;
        }

        // Null = 403/404, subreddit inaccessible
        if (!results) {
          console.warn(
            `[runRedditDiscovery] r/${subreddit} not accessible — skipping`
          );
          subredditsCompleted += 1;
          continue;
        }

        for (const item of results) {
          if (seenPostIds.has(item.postId)) {
            skippedDupes += 1;
            continue;
          }
          seenPostIds.add(item.postId);

          total += 1;
          try {
            const result = await ingestRedditResult(
              item,
              `subreddit:${subreddit}`
            );
            if (result.accepted) {
              accepted += 1;
              if (result.hasVideoLink) {
                withVideoLinks += 1;
              }
            }
          } catch (ingestErr) {
            if (ingestErr.isRateLimit) {
              console.warn(
                `[runRedditDiscovery] Rate-limited during subreddit ingest. Stopping gracefully.`
              );
              rateLimitHit = true;
              break;
            }
            console.error(
              `[runRedditDiscovery] Ingest error for post ${item.postId}: ${ingestErr.message}`
            );
          }
        }

        if (rateLimitHit) break;
        subredditsCompleted += 1;
      }
    }

    const finalStatus = rateLimitHit ? "partial" : "completed";

    const stats = {
      total,
      accepted,
      withVideoLinks,
      queriesRun: REDDIT_DISCOVERY_QUERIES.length,
      queriesCompleted,
      subredditsChecked: REDDIT_TARGET_SUBREDDITS.length,
      subredditsCompleted,
      skippedDupes,
      rateLimitHit
    };

    await finishCrawlRun(crawlRun.id, finalStatus, stats);

    console.log(
      `[runRedditDiscovery] Finished (${finalStatus}): ${accepted}/${total} accepted, ` +
        `${queriesCompleted}/${REDDIT_DISCOVERY_QUERIES.length} queries, ` +
        `${subredditsCompleted}/${REDDIT_TARGET_SUBREDDITS.length} subreddits, ` +
        `${skippedDupes} dupes skipped`
    );

    return stats;
  } catch (error) {
    await finishCrawlRun(crawlRun.id, "failed", {
      total,
      accepted,
      withVideoLinks,
      queriesCompleted,
      subredditsCompleted,
      skippedDupes,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  runRedditDiscovery
};
