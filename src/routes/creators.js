const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, name, slug, creator_type, bio,
             location, website_url, profile_image_url,
             tags, verified, featured, created_at
      FROM creators
      WHERE published = true
      ORDER BY featured DESC, verified DESC, name ASC
      LIMIT 50;
    `);

    res.json({
      ok: true,
      count: rows.length,
      results: rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "DB query failed" });
  }
});

module.exports = router;
