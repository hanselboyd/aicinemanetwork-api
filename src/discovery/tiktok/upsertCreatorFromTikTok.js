const pool = require("../../db/pool");
const { isBlockedCreatorName } = require("../shared/blockedCreatorNames");
const { normalizeName, generateUniqueSlug } = require("../shared/entityUtils");
const { extractContacts } = require("../shared/extractContacts");

async function findExistingCreator({ username, creatorId, normalizedName }) {
  const bySource = await pool.query(
    `
    select c.*
    from creators c
    join creator_sources s on s.creator_id = c.id
    where s.source_platform = 'tiktok'
      and (s.handle = $1 or s.external_id = $2)
    limit 1
    `,
    [username || null, creatorId || null]
  );

  if (bySource.rows.length) {
    return bySource.rows[0];
  }

  const byName = await pool.query(
    `select * from creators where normalized_name = $1 limit 1`,
    [normalizedName]
  );

  return byName.rows[0] || null;
}

async function saveContacts(creatorId, sourceUrl, contacts) {
  for (const contact of contacts) {
    await pool.query(
      `
      insert into creator_contacts (
        creator_id, contact_type, contact_value, source_platform, source_url, is_primary, created_at, updated_at
      )
      values ($1, $2, $3, 'tiktok', $4, false, now(), now())
      on conflict (creator_id, contact_type, contact_value)
      do update set updated_at = now(), source_url = excluded.source_url
      `,
      [creatorId, contact.type, contact.value, sourceUrl]
    );
  }
  return contacts;
}

async function upsertCreatorFromTikTok(sourceRow, item, classification) {
  const creatorName = item.creatorName || item.username || "Unknown Creator";

  if (isBlockedCreatorName(creatorName)) {
    return null;
  }

  const normalizedName = normalizeName(creatorName);

  let creator = await findExistingCreator({
    username: item.username,
    creatorId: item.creatorId,
    normalizedName
  });

  const profileUrl = `https://tiktok.com/@${item.username}`;

  if (!creator) {
    const slug = await generateUniqueSlug(creatorName, pool);

    const inserted = await pool.query(
      `
      insert into creators (
        name, slug, creator_type, normalized_name, primary_platform, primary_source_url,
        discovery_confidence, classification, last_discovered_at, auto_claim_ready
      )
      values ($1, $2, 'individual', $3, 'tiktok', $4, $5, $6, now(), false)
      returning *
      `,
      [creatorName, slug, normalizedName, profileUrl, classification.score, classification.label]
    );

    creator = inserted.rows[0];
  } else {
    const updated = await pool.query(
      `
      update creators
      set
        normalized_name = coalesce(creators.normalized_name, $2),
        discovery_confidence = greatest(coalesce(creators.discovery_confidence, 0), $3),
        classification = case when coalesce(creators.discovery_confidence, 0) <= $3 then $4 else creators.classification end,
        last_discovered_at = now()
      where id = $1
      returning *
      `,
      [creator.id, normalizedName, classification.score, classification.label]
    );

    creator = updated.rows[0];
  }

  // Extract contacts
  const bioContacts = extractContacts(item.creatorBio || "");
  const allContacts = [
    { type: "tiktok", value: profileUrl },
    ...bioContacts
  ];

  if (item.creatorLink) {
    allContacts.push({ type: "website", value: item.creatorLink });
  }

  const contacts = await saveContacts(creator.id, profileUrl, allContacts);

  await pool.query(
    `update creator_sources set creator_id = $1, contact_found = $2, updated_at = now() where id = $3`,
    [creator.id, contacts.length > 0, sourceRow.id]
  );

  const hasEmail = contacts.some((c) => c.type === "email");
  const hasWebsite = contacts.some((c) => c.type === "website");

  if (classification.score >= 70 && (hasEmail || hasWebsite)) {
    await pool.query(`update creators set auto_claim_ready = true where id = $1`, [creator.id]);
  }

  return creator;
}

module.exports = {
  upsertCreatorFromTikTok
};
