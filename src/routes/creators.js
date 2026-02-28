const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

/**
 * GET /api/creators
 * Supported query params:
 *   q=search term
 *   tag=tagName
 *   creator_type=individual|studio|collective
 *   featured=true
 *   verified=true
 *   limit=20
 *   offset=0
 */

router.get("/", async (req, res) => {
  try {
    const {
      q,
      tag,
      creator_type,
      featured,
      verified,
      limit = "20",
      offset = "0",
    } = req.query;

    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const off = parseInt(offset, 10) || 0;

    let where = ["published = true"];
    let params = [];
    let i = 1;

    if (creator_type) {
      where.push(`creator_type = $${i}`);
      params.push(creator_type);
      i++;
    }

    if (featured === "true") {
      where.push(`featured = true`);
    }

    if (verified === "true") {
      where.push(`verified = true`);
    }

    if (tag) {
      where.push(`$${i} = ANY(tags)`);
      params.push(tag);
      i++;
    }

    if (q) {
      where.push(`
        (
          name ILIKE $${i}
          OR bio ILIKE $${i}
        )
      `);
      params.push(`%${q}%`);
      i++;
    }

    params.push(lim);
    params.push(off);

    const sql = `
      SELECT
        id,
        name,
        slug,
        creator_type,
        bio,
        location,
        website_url,
        profile_image_url,
        tags,
        verified,
        featured,
        created_at,
        updated_at
      FROM creators
      WHERE ${where.join(" AND ")}
      ORDER BY featured DESC, verified DESC, name ASC
      LIMIT $${i} OFFSET $${i + 1};
    `;

    const { rows } = await pool.query(sql, params);

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
