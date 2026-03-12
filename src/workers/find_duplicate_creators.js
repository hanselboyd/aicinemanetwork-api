const pool = require("../db/pool");

function normalizeForComparison(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function similarity(a, b) {
  const s1 = normalizeForComparison(a);
  const s2 = normalizeForComparison(b);

  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;

  // Simple character overlap ratio
  const set1 = new Set(s1.split(""));
  const set2 = new Set(s2.split(""));
  const intersection = [...set1].filter(c => set2.has(c)).length;
  const union = new Set([...set1, ...set2]).size;

  return intersection / union;
}

async function findDuplicateCreators() {
  const creatorsRes = await pool.query(
    `
    select
      c.id,
      c.name,
      c.normalized_name,
      c.slug,
      c.primary_platform,
      c.discovery_confidence
    from creators c
    where c.primary_platform is not null
    order by c.discovery_confidence desc nulls last
    `
  );

  const creators = creatorsRes.rows;
  const duplicatePairs = [];
  const processed = new Set();

  for (let i = 0; i < creators.length; i++) {
    const c1 = creators[i];

    for (let j = i + 1; j < creators.length; j++) {
      const c2 = creators[j];

      const pairKey = [c1.id, c2.id].sort().join("::");
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      // Check name similarity
      const nameSim = similarity(c1.name, c2.name);
      const normalizedSim = similarity(c1.normalized_name, c2.normalized_name);

      if (nameSim < 0.7 && normalizedSim < 0.7) continue;

      // Get contacts for both
      const contacts1Res = await pool.query(
        `select contact_type, contact_value from creator_contacts where creator_id = $1`,
        [c1.id]
      );
      const contacts2Res = await pool.query(
        `select contact_type, contact_value from creator_contacts where creator_id = $1`,
        [c2.id]
      );

      const contacts1 = contacts1Res.rows;
      const contacts2 = contacts2Res.rows;

      // Check for shared contacts
      const sharedContacts = [];
      for (const ct1 of contacts1) {
        for (const ct2 of contacts2) {
          if (ct1.contact_type === ct2.contact_type && ct1.contact_value === ct2.contact_value) {
            sharedContacts.push(`${ct1.contact_type}:${ct1.contact_value}`);
          }
        }
      }

      // Calculate duplicate confidence
      let duplicateConfidence = 0;
      if (normalizedSim >= 0.95) duplicateConfidence += 50;
      else if (normalizedSim >= 0.8) duplicateConfidence += 30;
      else if (normalizedSim >= 0.7) duplicateConfidence += 15;

      if (nameSim >= 0.95) duplicateConfidence += 30;
      else if (nameSim >= 0.8) duplicateConfidence += 20;
      else if (nameSim >= 0.7) duplicateConfidence += 10;

      duplicateConfidence += sharedContacts.length * 20;

      if (duplicateConfidence < 50) continue;

      duplicatePairs.push({
        creator1: {
          id: c1.id,
          name: c1.name,
          platform: c1.primary_platform,
          score: c1.discovery_confidence
        },
        creator2: {
          id: c2.id,
          name: c2.name,
          platform: c2.primary_platform,
          score: c2.discovery_confidence
        },
        nameSimilarity: Math.round(nameSim * 100),
        normalizedSimilarity: Math.round(normalizedSim * 100),
        sharedContacts: sharedContacts.length,
        duplicateConfidence
      });
    }
  }

  // Sort by confidence
  duplicatePairs.sort((a, b) => b.duplicateConfidence - a.duplicateConfidence);

  // Output results
  console.log("\n=== POTENTIAL DUPLICATE CREATORS ===\n");
  console.log(`Total creators analyzed: ${creators.length}`);
  console.log(`Potential duplicates found: ${duplicatePairs.length}\n`);

  if (duplicatePairs.length > 0) {
    console.log("Top duplicate pairs:\n");
    console.table(duplicatePairs.slice(0, 20).map(p => ({
      creator1: p.creator1.name.slice(0, 20),
      platform1: p.creator1.platform,
      creator2: p.creator2.name.slice(0, 20),
      platform2: p.creator2.platform,
      nameSim: `${p.nameSimilarity}%`,
      sharedContacts: p.sharedContacts,
      confidence: p.duplicateConfidence
    })));
  }

  return {
    creatorsAnalyzed: creators.length,
    duplicatesFound: duplicatePairs.length,
    highConfidence: duplicatePairs.filter(p => p.duplicateConfidence >= 80).length,
    mediumConfidence: duplicatePairs.filter(p => p.duplicateConfidence >= 50 && p.duplicateConfidence < 80).length
  };
}

findDuplicateCreators()
  .then((result) => {
    console.log("\nDuplicate detection summary:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Duplicate detection failed:", error);
    process.exit(1);
  });
