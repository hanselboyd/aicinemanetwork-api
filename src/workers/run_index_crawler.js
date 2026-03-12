const pool = require("../db/pool");

// Import all platform discovery runners
const { runYoutubeDiscovery } = require("../discovery/youtube/runYoutubeDiscovery");
const { runVimeoDiscovery } = require("../discovery/vimeo/runVimeoDiscovery");
const { runInstagramDiscovery } = require("../discovery/instagram/runInstagramDiscovery");
const { runTikTokDiscovery } = require("../discovery/tiktok/runTikTokDiscovery");
const { runXDiscovery } = require("../discovery/x/runXDiscovery");
const { runRedditDiscovery } = require("../discovery/reddit/runRedditDiscovery");
const { runWebDiscovery } = require("../discovery/web/runWebDiscovery");

// Platform runner map
const PLATFORM_RUNNERS = {
  youtube: runYoutubeDiscovery,
  vimeo: runVimeoDiscovery,
  instagram: runInstagramDiscovery,
  tiktok: runTikTokDiscovery,
  x: runXDiscovery,
  reddit: runRedditDiscovery,
  web: runWebDiscovery
};

// All available platforms
const ALL_PLATFORMS = Object.keys(PLATFORM_RUNNERS);

// Default enabled platforms for "all" source
const DEFAULT_ENABLED_PLATFORMS = ["youtube", "vimeo", "instagram", "tiktok", "x", "reddit", "web"];

/**
 * Run discovery for a single platform
 */
async function runPlatformDiscovery(platform) {
  const runner = PLATFORM_RUNNERS[platform];
  if (!runner) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  console.log(`[IndexCrawler] Starting ${platform} discovery...`);
  const startTime = Date.now();

  try {
    const result = await runner();
    const duration = Date.now() - startTime;

    console.log(`[IndexCrawler] ${platform} complete in ${duration}ms:`, result);

    return {
      platform,
      status: "completed",
      duration,
      ...result
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[IndexCrawler] ${platform} failed:`, error.message);

    return {
      platform,
      status: "failed",
      duration,
      error: error.message
    };
  }
}

/**
 * Run the index crawler for specified sources
 * @param {string|string[]} sources - Platform name(s) or "all"
 * @param {object} options - Additional options
 */
async function runIndexCrawler(sources = "all", options = {}) {
  const startTime = Date.now();
  const runId = Date.now().toString(36);

  console.log(`[IndexCrawler] Starting run ${runId}`);
  console.log(`[IndexCrawler] Sources: ${JSON.stringify(sources)}`);

  // Determine which platforms to run
  let platforms = [];

  if (sources === "all") {
    platforms = options.enabledPlatforms || DEFAULT_ENABLED_PLATFORMS;
  } else if (Array.isArray(sources)) {
    platforms = sources.filter(p => ALL_PLATFORMS.includes(p));
  } else if (typeof sources === "string") {
    if (ALL_PLATFORMS.includes(sources)) {
      platforms = [sources];
    }
  }

  if (platforms.length === 0) {
    throw new Error(`No valid platforms specified. Available: ${ALL_PLATFORMS.join(", ")}`);
  }

  console.log(`[IndexCrawler] Running platforms: ${platforms.join(", ")}`);

  // Run discovery for each platform
  const results = [];
  let totalDiscovered = 0;
  let totalAccepted = 0;
  let totalFailed = 0;

  for (const platform of platforms) {
    const result = await runPlatformDiscovery(platform);
    results.push(result);

    if (result.status === "completed") {
      totalDiscovered += result.total || 0;
      totalAccepted += result.accepted || 0;
    } else {
      totalFailed += 1;
    }
  }

  const totalDuration = Date.now() - startTime;

  // Build summary
  const summary = {
    runId,
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    duration: totalDuration,
    platforms: platforms.length,
    platformsCompleted: results.filter(r => r.status === "completed").length,
    platformsFailed: totalFailed,
    totalDiscovered,
    totalAccepted,
    acceptRate: totalDiscovered > 0 ? Math.round((totalAccepted / totalDiscovered) * 100) : 0,
    results
  };

  console.log(`[IndexCrawler] Run ${runId} complete in ${totalDuration}ms`);
  console.log(`[IndexCrawler] Summary:`, {
    platforms: summary.platforms,
    discovered: summary.totalDiscovered,
    accepted: summary.totalAccepted,
    acceptRate: `${summary.acceptRate}%`
  });

  return summary;
}

/**
 * Get available platforms and their status
 */
function getAvailablePlatforms() {
  return ALL_PLATFORMS.map(platform => ({
    id: platform,
    name: platform.charAt(0).toUpperCase() + platform.slice(1),
    enabled: DEFAULT_ENABLED_PLATFORMS.includes(platform),
    hasRunner: !!PLATFORM_RUNNERS[platform]
  }));
}

/**
 * Get crawler stats from database
 */
async function getCrawlerStats() {
  const stats = {};

  // Get creator counts by platform
  const platformCounts = await pool.query(`
    SELECT primary_platform, COUNT(*) as count
    FROM creators
    WHERE primary_platform IS NOT NULL
    GROUP BY primary_platform
    ORDER BY count DESC
  `);
  stats.creatorsByPlatform = platformCounts.rows;

  // Get source counts by platform
  const sourceCounts = await pool.query(`
    SELECT source_platform, COUNT(*) as count
    FROM creator_sources
    GROUP BY source_platform
    ORDER BY count DESC
  `);
  stats.sourcesByPlatform = sourceCounts.rows;

  // Get classification breakdown
  const classifications = await pool.query(`
    SELECT classification, COUNT(*) as count
    FROM creators
    WHERE classification IS NOT NULL
    GROUP BY classification
    ORDER BY count DESC
  `);
  stats.classifications = classifications.rows;

  // Get recent crawl runs
  const recentRuns = await pool.query(`
    SELECT id, source_platform, query, status, started_at, finished_at, stats
    FROM crawl_runs
    ORDER BY started_at DESC
    LIMIT 10
  `);
  stats.recentRuns = recentRuns.rows;

  // Get totals
  const totals = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM creators) as total_creators,
      (SELECT COUNT(*) FROM creator_sources) as total_sources,
      (SELECT COUNT(*) FROM creator_contacts) as total_contacts,
      (SELECT COUNT(*) FROM outreach_queue) as total_queued,
      (SELECT COUNT(*) FROM creators WHERE classification = 'ai_filmmaker') as ai_filmmakers,
      (SELECT COUNT(*) FROM creators WHERE auto_claim_ready = true) as claim_ready
  `);
  stats.totals = totals.rows[0];

  return stats;
}

module.exports = {
  runIndexCrawler,
  runPlatformDiscovery,
  getAvailablePlatforms,
  getCrawlerStats,
  ALL_PLATFORMS,
  DEFAULT_ENABLED_PLATFORMS
};

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const source = args[0] || "all";

  runIndexCrawler(source)
    .then((result) => {
      console.log("\n=== INDEX CRAWLER COMPLETE ===");
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error("Index crawler failed:", error);
      process.exit(1);
    });
}
