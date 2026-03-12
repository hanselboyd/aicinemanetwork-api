const pool = require("../db/pool");
const { buildClaimReadyList } = require("./build_claim_ready_list");

function pickBestContact(contacts) {
  const priority = ["email", "website", "instagram", "x", "tiktok", "vimeo"];

  const sorted = [...contacts].sort((a, b) => {
    return priority.indexOf(a.contact_type) - priority.indexOf(b.contact_type);
  });

  return sorted[0] || null;
}

function isBadOutreachContact(contact) {
  const value = String(contact?.contact_value || "").toLowerCase();

  if (value.includes("runwayml.com")) return true;
  if (value.includes("openai.com")) return true;
  if (value.includes("midjourney.com")) return true;
  if (value.includes("pika.art")) return true;
  if (value.includes("kling")) return true;
  if (value.includes("sora")) return true;
  if (value.includes("canva.com")) return true;
  if (value.includes("adobe.com")) return true;
  if (value.includes("stability.ai")) return true;
  if (value.includes("luma")) return true;
  if (value.includes("enable-javascript.com")) return true;

  return false;
}

function buildReason(row, contact) {
  return [
    `classification=${row.classification || "unknown"}`,
    `score=${row.discovery_confidence || 0}`,
    `readiness_score=${row.readiness_score || 0}`,
    `contact_type=${contact.contact_type}`
  ].join("; ");
}

async function buildOutreachQueue() {
  const shortlist = await buildClaimReadyList();

  let reviewed = 0;
  let queued = 0;
  let skippedNoContact = 0;
  let skippedExisting = 0;
  let skippedBadContact = 0;

  for (const row of shortlist.rows) {
    if (!row.priority_outreach) {
      continue;
    }

    reviewed += 1;

    const contactsRes = await pool.query(
      `
      select contact_type, contact_value
      from creator_contacts
      where creator_id = $1
        and contact_type in ('email', 'website', 'instagram', 'x', 'tiktok', 'vimeo')
      `,
      [row.creator_id]
    );

    const contacts = (contactsRes.rows || []).filter((contact) => !isBadOutreachContact(contact));

    if (!contacts.length) {
      const allContacts = contactsRes.rows || [];
      if (allContacts.length) {
        skippedBadContact += 1;
      } else {
        skippedNoContact += 1;
      }
      continue;
    }

    const bestContact = pickBestContact(contacts);
    if (!bestContact) {
      skippedNoContact += 1;
      continue;
    }

    const existingRes = await pool.query(
      `
      select id
      from outreach_queue
      where creator_id = $1
        and contact_type = $2
        and contact_value = $3
      limit 1
      `,
      [row.creator_id, bestContact.contact_type, bestContact.contact_value]
    );

    if (existingRes.rows.length) {
      skippedExisting += 1;
      continue;
    }

    await pool.query(
      `
      insert into outreach_queue (
        creator_id,
        contact_type,
        contact_value,
        status,
        reason,
        created_at,
        updated_at
      )
      values ($1, $2, $3, 'pending', $4, now(), now())
      `,
      [
        row.creator_id,
        bestContact.contact_type,
        bestContact.contact_value,
        buildReason(row, bestContact)
      ]
    );

    queued += 1;
  }

  return {
    reviewed,
    queued,
    skippedNoContact,
    skippedExisting,
    skippedBadContact
  };
}

if (require.main === module) {
  buildOutreachQueue()
    .then((result) => {
      console.log("Outreach queue build complete:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Outreach queue build failed:", error);
      process.exit(1);
    });
}

module.exports = {
  buildOutreachQueue
};
