const pool = require("../db/pool");

async function reclassifyVimeoCreators() {
  const creatorsRes = await pool.query(
    `
    select id, name
    from creators
    where primary_platform = 'vimeo'
    order by last_discovered_at desc nulls last
    `
  );

  let processed = 0;
  let updated = 0;

  for (const creator of creatorsRes.rows) {
    processed += 1;

    const sourceRes = await pool.query(
      `
      select
        id,
        creator_id,
        confidence_score,
        classifier_label,
        updated_at
      from creator_sources
      where creator_id = $1
        and source_platform = 'vimeo'
      order by updated_at desc nulls last, created_at desc nulls last
      limit 1
      `,
      [creator.id]
    );

    const latestSource = sourceRes.rows[0];
    if (!latestSource) {
      continue;
    }

    const contactsRes = await pool.query(
      `
      select contact_type
      from creator_contacts
      where creator_id = $1
      `,
      [creator.id]
    );

    const contactTypes = contactsRes.rows.map((r) => r.contact_type);
    const hasEmail = contactTypes.includes("email");
    const hasWebsiteLike = contactTypes.some((type) =>
      ["website", "instagram", "x", "tiktok", "vimeo"].includes(type)
    );

    const autoClaimReady =
      Number(latestSource.confidence_score || 0) >= 70 &&
      (hasEmail || hasWebsiteLike);

    await pool.query(
      `
      update creators
      set
        discovery_confidence = $2,
        classification = $3,
        auto_claim_ready = $4,
        last_discovered_at = coalesce(last_discovered_at, now())
      where id = $1
      `,
      [
        creator.id,
        latestSource.confidence_score || 0,
        latestSource.classifier_label || null,
        autoClaimReady
      ]
    );

    updated += 1;
  }

  return {
    processed,
    updated
  };
}

if (require.main === module) {
  reclassifyVimeoCreators()
    .then((result) => {
      console.log("Vimeo creator reclassification complete:", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Vimeo creator reclassification failed:", error);
      process.exit(1);
    });
}

module.exports = {
  reclassifyVimeoCreators
};
