const { REDDIT_DISCOVERY_QUERIES, REDDIT_TARGET_SUBREDDITS } = require("./queries");
const { searchRedditPosts, getSubredditPosts } = require("./redditClient");
const { ingestRedditResult } = require("./ingestRedditResult");
const { createCrawlRun, finishCrawlRun } = require("../shared/crawlRuns");

async function runRedditDiscovery() {
  const crawlRun = await createCrawlRun({
    sourcePlatform: "reddit",
    query: "batch_discovery"
  });

  let total = 0;
  let accepted = 0;
  let withVideoLinks = 0;

  try {
    // Search by queries
    for (const query of REDDIT_DISCOVERY_QUERIES) {
      console.log(`[runRedditDiscovery] Searching for: ${query}`);
      const results = await searchRedditPosts(query);

      for (const item of results) {
        total += 1;
        const result = await ingestRedditResult(item, query);
        if (result.accepted) {
          accepted += 1;
          if (result.hasVideoLink) {
            withVideoLinks += 1;
          }
        }
      }
    }

    // Browse target subreddits
    for (const subreddit of REDDIT_TARGET_SUBREDDITS) {
      console.log(`[runRedditDiscovery] Browsing subreddit: ${subreddit}`);
      const results = await getSubredditPosts(subreddit, 25);

      for (const item of results) {
        total += 1;
        const result = await ingestRedditResult(item, `subreddit:${subreddit}`);
        if (result.accepted) {
          accepted += 1;
          if (result.hasVideoLink) {
            withVideoLinks += 1;
          }
        }
      }
    }

    await finishCrawlRun(crawlRun.id, "completed", {
      total,
      accepted,
      withVideoLinks,
      queriesRun: REDDIT_DISCOVERY_QUERIES.length,
      subredditsChecked: REDDIT_TARGET_SUBREDDITS.length
    });

    return {
      total,
      accepted,
      withVideoLinks,
      queriesRun: REDDIT_DISCOVERY_QUERIES.length,
      subredditsChecked: REDDIT_TARGET_SUBREDDITS.length
    };
  } catch (error) {
    await finishCrawlRun(crawlRun.id, "failed", {
      total,
      accepted,
      withVideoLinks,
      error: error.message
    });

    throw error;
  }
}

module.exports = {
  runRedditDiscovery
};
