const pool = require("../db/pool");

function pickBestContact(contacts) {
  const priority = ["email", "website", "instagram", "x", "tiktok", "vimeo"];

  const sorted = [...contacts].sort((a, b) => {
    return priority.indexOf(a.contact_type) - priority.indexOf(b.contact_type);
  });

  return sorted[0] || null;
}

function buildReason(creator, contact) {
  return [
    `classification=${creator.classification || "unknown"}`,
    `score=${creator.discovery_confidence || 0}`,
    `contact_type=${contact.contact_type}`
  ].join("; ");
}

async function buildOutreachQueue() {
  const creatorsRes = await pool.query(
    `
    select
      c.id,
      c.name,
      c.slug,
      c.discovery_confidence,
      c.classification,
      c.auto_claim_ready
    from creators c
    where c.primary_platform is not null
      and c.classification = 'ai_filmmaker'
      and coalesce(c.discovery_confidence, 0) >= 70
      and c.auto_claim_ready = true
    order by c.discovery_confidence desc, c.last_discovered_at desc nulls last
    `
  );

  let reviewed = 0;
  let queued = 0;
  let skippedNoContact = 0;
  let skippedExisting = 0;

  for (const creator of creatorsRes.rows) {
    reviewed += 1;

    const contactsRes = await pool.query(
      `
      select contact_type, contact_value
      from creator_contacts
      where creator_id = $1
        and contact_type in ('email', 'website', 'instagram', 'x', 'tiktok', 'vimeo')
      `,
      [creator.id]
    );

    const contacts = contactsRes.rows || [];
    if (!contacts.length) {
      skippedNoContact += 1;
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
      [creator.id, bestContact.contact_type, bestContact.contact_value]
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
        creator.id,
        bestContact.contact_type,
        bestContact.contact_value,
        buildReason(creator, bestContact)
      ]
    );

    queued += 1;
  }

  return {
    reviewed,
    queued,
    skippedNoContact,
    skippedExisting
  };
}

buildOutreachQueue()
  .then((result) => {
    console.log("Outreach queue build complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Outreach queue build failed:", error);
    process.exit(1);
  });
