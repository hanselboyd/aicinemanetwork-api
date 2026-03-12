const pool = require("../db/pool");

const API_BASE =
  process.env.API_BASE_URL || "https://aicinemanetwork-api.onrender.com";

const REQUEST_TIMEOUT_MS = 12000;
const DEFAULT_LIMIT = 25;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "AICinemaNetwork-ClaimInviteWorker/1.0",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function loadCreatorsReadyForClaims(limit = DEFAULT_LIMIT) {
  const sql = `
    SELECT
      id,
      name,
      email,
      claim_outreach_status,
      claim_outreach_ready
    FROM creators
    WHERE published = true
      AND claim_outreach_ready = true
      AND claim_outreach_status = 'ready'
      AND email IS NOT NULL
    ORDER BY updated_at ASC NULLS FIRST, created_at ASC
    LIMIT $1
  `;

  const { rows } = await pool.query(sql, [limit]);
  return rows;
}

async function markEmailSent(creatorId) {
  const sql = `
    UPDATE creators
    SET
      claim_outreach_status = 'email_sent',
      updated_at = NOW()
    WHERE id = $1
    RETURNING id, name, email, claim_outreach_status
  `;

  const { rows } = await pool.query(sql, [creatorId]);
  return rows[0] || null;
}

async function sendClaimInvite(creator) {
  const response = await fetchWithTimeout(`${API_BASE}/api/claim/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      creator_id: creator.id,
      email: creator.email
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `Claim send failed (${response.status}): ${JSON.stringify(data)}`
    );
  }

  return data;
}

async function run() {
  console.log("[ClaimInviteWorker] Starting claim invite run...");

  const limit = parseInt(process.env.CLAIM_INVITE_LIMIT || `${DEFAULT_LIMIT}`, 10);
  const creators = await loadCreatorsReadyForClaims(limit);

  console.log(`[ClaimInviteWorker] Found ${creators.length} creator(s) ready for claim outreach.`);

  let sentCount = 0;
  let failedCount = 0;

  for (const creator of creators) {
    try {
      console.log(`[ClaimInviteWorker] Sending invite to ${creator.name} <${creator.email}>`);

      const result = await sendClaimInvite(creator);
      const updated = await markEmailSent(creator.id);

      sentCount += 1;

      console.log("[ClaimInviteWorker] Claim API result:", result);
      console.log("[ClaimInviteWorker] Updated creator:", updated);

      await sleep(400);
    } catch (error) {
      failedCount += 1;
      console.error(
        `[ClaimInviteWorker] Failed for ${creator.name} (${creator.id}):`,
        error.message
      );
    }
  }

  console.log("[ClaimInviteWorker] Complete.");
  console.log({
    processed: creators.length,
    sent: sentCount,
    failed: failedCount
  });

  await pool.end();
}

run().catch(async (error) => {
  console.error("[ClaimInviteWorker] Fatal error:", error);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
