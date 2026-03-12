const pool = require("../db/pool");

async function buildClaimReadyList() {
  const creatorsRes = await pool.query(
    `
    select
      c.id,
      c.name,
      c.slug,
      c.primary_platform,
      c.discovery_confidence,
      c.combined_discovery_score,
      c.classification,
      c.auto_claim_ready,
      c.claim_priority,
      c.source_count,
      c.platform_count,
      c.has_youtube,
      c.has_vimeo,
      c.has_instagram,
      c.has_tiktok,
      c.has_x,
      c.has_website
    from creators c
    where c.classification = 'ai_filmmaker'
      and coalesce(c.discovery_confidence, 0) >= 70
      and c.auto_claim_ready = true
    order by
      c.claim_priority asc nulls last,
      coalesce(c.combined_discovery_score, c.discovery_confidence) desc,
      c.last_discovered_at desc nulls last
    limit 100
    `
  );

  const claimReadyList = [];

  for (const creator of creatorsRes.rows) {
    // Get best contact
    const contactsRes = await pool.query(
      `
      select contact_type, contact_value
      from creator_contacts
      where creator_id = $1
      order by
        case contact_type
          when 'email' then 1
          when 'website' then 2
          when 'instagram' then 3
          when 'x' then 4
          when 'tiktok' then 5
          when 'vimeo' then 6
          when 'youtube' then 7
          else 8
        end
      limit 3
      `,
      [creator.id]
    );

    const contacts = contactsRes.rows || [];
    const bestContact = contacts[0] || null;

    // Check if already in outreach queue
    const queueRes = await pool.query(
      `
      select id, status
      from outreach_queue
      where creator_id = $1
      limit 1
      `,
      [creator.id]
    );
    const inQueue = queueRes.rows.length > 0;
    const queueStatus = queueRes.rows[0]?.status || null;

    // Build platforms list
    const platforms = [];
    if (creator.has_youtube) platforms.push('youtube');
    if (creator.has_vimeo) platforms.push('vimeo');
    if (creator.has_instagram) platforms.push('instagram');
    if (creator.has_tiktok) platforms.push('tiktok');
    if (creator.has_x) platforms.push('x');
    if (creator.has_website) platforms.push('website');

    // Build qualification reason
    const reasons = [];
    if (creator.discovery_confidence >= 80) reasons.push('high_confidence');
    if (creator.platform_count >= 2) reasons.push('multi_platform');
    if (contacts.some(c => c.contact_type === 'email')) reasons.push('has_email');
    if (creator.has_website) reasons.push('has_website');

    claimReadyList.push({
      id: creator.id,
      name: creator.name,
      slug: creator.slug,
      score: creator.combined_discovery_score || creator.discovery_confidence,
      priority: creator.claim_priority || 3,
      platforms: platforms.join(', '),
      platformCount: creator.platform_count || 1,
      bestContactType: bestContact?.contact_type || 'none',
      bestContactValue: bestContact?.contact_value || 'none',
      inQueue,
      queueStatus,
      qualificationReasons: reasons.join(', ')
    });
  }

  // Output summary
  console.log("\n=== CLAIM-READY CREATOR LIST ===\n");
  console.log(`Total claim-ready creators: ${claimReadyList.length}\n`);

  // Group by priority
  const priority1 = claimReadyList.filter(c => c.priority === 1);
  const priority2 = claimReadyList.filter(c => c.priority === 2);
  const priority3 = claimReadyList.filter(c => c.priority === 3);

  console.log(`Priority 1 (high): ${priority1.length}`);
  console.log(`Priority 2 (medium): ${priority2.length}`);
  console.log(`Priority 3 (low): ${priority3.length}\n`);

  // Show top 20
  console.log("Top 20 claim-ready creators:\n");
  console.table(claimReadyList.slice(0, 20).map(c => ({
    name: c.name.slice(0, 25),
    score: c.score,
    priority: c.priority,
    platforms: c.platforms,
    contact: c.bestContactType,
    inQueue: c.inQueue ? 'yes' : 'no',
    reasons: c.qualificationReasons
  })));

  return {
    total: claimReadyList.length,
    priority1: priority1.length,
    priority2: priority2.length,
    priority3: priority3.length,
    inQueue: claimReadyList.filter(c => c.inQueue).length,
    notInQueue: claimReadyList.filter(c => !c.inQueue).length
  };
}

buildClaimReadyList()
  .then((result) => {
    console.log("\nClaim-ready list summary:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Claim-ready list build failed:", error);
    process.exit(1);
  });
