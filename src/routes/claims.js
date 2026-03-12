const express = require("express");
const crypto = require("crypto");
const pool = require("../db/pool");

const router = express.Router();

router.post("/send", async (req, res) => {
  try {
    const { creator_id, email } = req.body;

    if (!creator_id || !email) {
      return res.status(400).json({
        ok: false,
        error: "creator_id and email are required"
      });
    }

    await pool.query(`
      ALTER TABLE creators
      ADD COLUMN IF NOT EXISTS claim_token TEXT,
      ADD COLUMN IF NOT EXISTS claim_sent_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS claim_email TEXT
    `);

    const creatorResult = await pool.query(
      `
      SELECT id, name
      FROM creators
      WHERE id = $1
      `,
      [creator_id]
    );

    if (creatorResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "creator not found"
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const claimUrl = `https://aicinemanetwork.com/claim?token=${token}`;

    const updateResult = await pool.query(
      `
      UPDATE creators
      SET
        claim_token = $1,
        claim_sent_at = NOW(),
        claim_email = $2,
        claim_outreach_status = 'email_sent',
        updated_at = NOW()
      WHERE id = $3
      RETURNING
        id,
        name,
        claim_email,
        claim_outreach_status,
        claim_sent_at
      `,
      [token, email, creator_id]
    );

    console.log("[ClaimSend] Prepared claim invite", {
      creator_id,
      email,
      claimUrl
    });

    return res.json({
      ok: true,
      message: "Claim invite prepared",
      creator: updateResult.rows[0],
      claim_url: claimUrl
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok: false,
      error: "claim send failed"
    });
  }
});

module.exports = router;
