const express = require("express");
const router = express.Router();
const { buildDashboardStats } = require("../workers/build_dashboard_stats");

router.get("/dashboard", async (req, res) => {
  try {
    const stats = await buildDashboardStats();
    res.json({
      ok: true,
      stats
    });
  } catch (error) {
    console.error("[stats] dashboard failed:", error);
    res.status(500).json({
      ok: false,
      error: error.message || "Failed to build dashboard stats"
    });
  }
});

module.exports = router;
