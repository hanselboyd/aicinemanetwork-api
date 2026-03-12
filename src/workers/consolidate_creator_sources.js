const pool = require("../db/pool");

async function consolidateCreatorSources() {
  // Get all creators with sources
  const creatorsRes = await pool.query(
    `
    select
      c.id,
      c.name,
      c.slug,
      c.primary_platform,
      c.primary_source_url,
      c.discovery_confidence,
      c.classification
    from creators c
    where c.primary_platform is not null
    order by c.discovery_confidence desc nulls last
    `
  );

  let processed = 0;
  let updated = 0;

  for (const creator of creatorsRes.rows) {
    processed += 1;

    // Get all sources for this creator
    const sourcesRes = await pool.query(
      `
      select
        source_platform,
        source_url,
        confidence_score,
        classifier_label,
        created_at
      from creator_sources
      where creator_id = $1
      order by confidence_score desc nulls last
      `,
      [creator.id]
    );

    const sources = sourcesRes.rows || [];
    if (sources.length === 0) continue;

    // Compute platform flags
    const platforms = new Set(sources.map(s => s.source_platform));
    const hasYoutube = platforms.has('youtube');
    const hasVimeo = platforms.has('vimeo');
    const hasInstagram = platforms.has('instagram');
    const hasTiktok = platforms.has('tiktok');
    const hasX = platforms.has('x');
    const hasReddit = platforms.has('reddit');
    const hasWeb = platforms.has('web');

    // Check for website contact
    const contactsRes = await pool.query(
      `
      select contact_type
      from creator_contacts
      where creator_id = $1
      `,
      [creator.id]
    );
    const contactTypes = new Set(contactsRes.rows.map(c => c.contact_type));
    const hasWebsite = contactTypes.has('website');
    const hasEmail = contactTypes.has('email');

    // Compute combined discovery score
    // Base: best source score
    // Boost: +5 per additional platform, +10 for website, +15 for email
    const bestScore = Math.max(...sources.map(s => s.confidence_score || 0));
    let combinedScore = bestScore;
    combinedScore += Math.min((platforms.size - 1) * 5, 20); // Max +20 for multi-platform
    if (hasWebsite) combinedScore += 10;
    if (hasEmail) combinedScore += 15;
    combinedScore = Math.min(combinedScore, 100);

    // Compute claim priority
    // 1 = high (multi-platform + email)
    // 2 = medium (multi-platform or email)
    // 3 = low (single platform, no email)
    let claimPriority = 3;
    if (platforms.size >= 2 && hasEmail) {
      claimPriority = 1;
    } else if (platforms.size >= 2 || hasEmail) {
      claimPriority = 2;
    }

    // Update creator with consolidated data
    await pool.query(
      `
      update creators
      set
        source_count = $2,
        platform_count = $3,
        has_youtube = $4,
        has_vimeo = $5,
        has_instagram = $6,
        has_tiktok = $7,
        has_x = $8,
        has_website = $9,
        combined_discovery_score = $10,
        claim_priority = $11,
        updated_at = now()
      where id = $1
      `,
      [
        creator.id,
        sources.length,
        platforms.size,
        hasYoutube,
        hasVimeo,
        hasInstagram,
        hasTiktok,
        hasX,
        hasWebsite || hasWeb,
        combinedScore,
        claimPriority
      ]
    );

    updated += 1;
  }

  return {
    processed,
    updated
  };
}

consolidateCreatorSources()
  .then((result) => {
    console.log("Creator source consolidation complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Creator source consolidation failed:", error);
    process.exit(1);
  });
