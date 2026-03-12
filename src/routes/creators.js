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
        social_links,
        tags,
        verified,
        featured,
        published,
        email,
        email_source_url,
        email_confidence,
        email_type,
        best_contact_url,
        best_contact_method,
        claim_outreach_ready,
        claim_outreach_status,
        contact_discovered_at,
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
/**
 * POST /api/creators/enrich
 * Save crawler-discovered contact enrichment data
 */

router.post("/enrich", async (req, res) => {
  try {

    const {
      creator_id,
      email,
      email_source_url,
      email_confidence,
      email_type,
      best_contact_url,
      best_contact_method,
      claim_outreach_ready,
      claim_outreach_status,
      contact_discovered_at
    } = req.body;

    if (!creator_id) {
      return res.status(400).json({
        ok: false,
        error: "creator_id required"
      });
    }

    const sql = `
      UPDATE creators
      SET
        email = COALESCE($1, email),
        email_source_url = COALESCE($2, email_source_url),
        email_confidence = COALESCE($3, email_confidence),
        email_type = COALESCE($4, email_type),
        best_contact_url = COALESCE($5, best_contact_url),
        best_contact_method = COALESCE($6, best_contact_method),
        claim_outreach_ready = COALESCE($7, claim_outreach_ready),
        claim_outreach_status = COALESCE($8, claim_outreach_status),
        contact_discovered_at = COALESCE($9, contact_discovered_at)
      WHERE id = $10
      RETURNING
  id,
  name,
  email,
  best_contact_url,
  best_contact_method,
  claim_outreach_ready,
  claim_outreach_status;
    `;

    const { rows } = await pool.query(sql, [
      email,
      email_source_url,
      email_confidence,
      email_type,
      best_contact_url,
      best_contact_method,
      claim_outreach_ready,
      claim_outreach_status,
      contact_discovered_at,
      creator_id
    ]);

    if (rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "creator not found"
      });
    }

    res.json({
      ok: true,
      creator: rows[0]
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      ok: false,
      error: "creator enrichment failed"
    });

  }
});
module.exports = router;
