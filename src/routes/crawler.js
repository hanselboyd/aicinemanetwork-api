const express = require("express");
const router = express.Router();

const {
  runIndexCrawler,
  runPlatformDiscovery,
  getAvailablePlatforms,
  getCrawlerStats,
  ALL_PLATFORMS
} = require("../workers/run_index_crawler");

// In-memory run tracking (for async runs)
const activeRuns = new Map();

/**
 * GET /api/crawler/platforms
 * Get available platforms for the source selector
 */
router.get("/platforms", (req, res) => {
  try {
    const platforms = getAvailablePlatforms();
    res.json({
      ok: true,
      platforms,
      all: ALL_PLATFORMS
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/crawler/stats
 * Get crawler statistics for the dashboard
 */
router.get("/stats", async (req, res) => {
  try {
    const stats = await getCrawlerStats();
    res.json({
      ok: true,
      stats
    });
  } catch (error) {
    console.error("[CrawlerAPI] Stats error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/crawler/run
 * Start a crawler run
 * Body: { source: "youtube" | "vimeo" | "all" | ["youtube", "vimeo"] }
 */
router.post("/run", async (req, res) => {
  try {
    const { source = "all", async: runAsync = false } = req.body;

    // Validate source
    if (source !== "all" && !Array.isArray(source)) {
      if (!ALL_PLATFORMS.includes(source)) {
        return res.status(400).json({
          ok: false,
          error: `Invalid source: ${source}. Available: ${ALL_PLATFORMS.join(", ")}, all`
        });
      }
    }

    if (runAsync) {
      // Start async run
      const runId = Date.now().toString(36);
      activeRuns.set(runId, { status: "running", startedAt: new Date() });

      // Run in background
      runIndexCrawler(source)
        .then((result) => {
          activeRuns.set(runId, { status: "completed", result, completedAt: new Date() });
        })
        .catch((error) => {
          activeRuns.set(runId, { status: "failed", error: error.message, completedAt: new Date() });
        });

      return res.json({
        ok: true,
        runId,
        status: "started",
        message: `Crawler started for source: ${JSON.stringify(source)}`
      });
    }

    // Synchronous run
    const result = await runIndexCrawler(source);
    res.json({
      ok: true,
      result
    });
  } catch (error) {
    console.error("[CrawlerAPI] Run error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/crawler/run/:runId
 * Get status of an async run
 */
router.get("/run/:runId", (req, res) => {
  const { runId } = req.params;
  const run = activeRuns.get(runId);

  if (!run) {
    return res.status(404).json({ ok: false, error: "Run not found" });
  }

  res.json({
    ok: true,
    runId,
    ...run
  });
});

/**
 * POST /api/crawler/run/:platform
 * Run discovery for a single platform
 */
router.post("/run/:platform", async (req, res) => {
  try {
    const { platform } = req.params;

    if (!ALL_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        ok: false,
        error: `Invalid platform: ${platform}. Available: ${ALL_PLATFORMS.join(", ")}`
      });
    }

    const result = await runPlatformDiscovery(platform);
    res.json({
      ok: true,
      result
    });
  } catch (error) {
    console.error("[CrawlerAPI] Platform run error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * GET /api/crawler/history
 * Get recent crawl run history
 */
router.get("/history", async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const pool = require("../db/pool");

    const result = await pool.query(`
      SELECT 
        id, 
        source_platform, 
        query, 
        status, 
        started_at, 
        finished_at,
        stats,
        EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000 as duration_ms
      FROM crawl_runs
      ORDER BY started_at DESC
      LIMIT $1
    `, [parseInt(limit, 10)]);

    res.json({
      ok: true,
      runs: result.rows
    });
  } catch (error) {
    console.error("[CrawlerAPI] History error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
