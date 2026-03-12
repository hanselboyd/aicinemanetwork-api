const pool = require("../../db/pool");
const { isBlockedCreatorName } = require("../shared/blockedCreatorNames");
const { normalizeName, generateUniqueSlug } = require("../shared/entityUtils");
const { extractContacts } = require("../shared/extractContacts");

async function findExistingCreator({ username, normalizedName }) {
  // First try to find by Instagram source
  const bySource = await pool.query(
    `
    select c.*
    from creators c
    join creator_sources s on s.creator_id = c.id
    where s.source_platform = 'instagram'
      and s.handle = $1
    limit 1
    `,
    [username || null]
  );

  if (bySource.rows.length) {
    return bySource.rows[0];
  }

  // Then try normalized name
  const byName = await pool.query(
    `
    select *
    from creators
    where normalized_name = $1
    limit 1
    `,
    [normalizedName]
  );

  if (byName.rows.length) {
    return byName.rows[0];
  }

  return null;
}

async function saveContacts(creatorId, sourceUrl, contacts) {
  for (const contact of contacts) {
    await pool.query(
      `
      insert into creator_contacts (
        creator_id,
        contact_type,
        contact_value,
        source_platform,
        source_url,
        is_primary,
        created_at,
        updated_at
      )
      values ($1, $2, $3, 'instagram', $4, false, now(), now())
      on conflict (creator_id, contact_type, contact_value)
      do update set
        updated_at = now(),
        source_url = excluded.source_url
      `,
      [creatorId, contact.type, contact.value, sourceUrl]
    );
  }

  return contacts;
}

async function upsertCreatorFromInstagram(sourceRow, item, classification) {
  const creatorName = item.fullName || item.username || "Unknown Creator";

  if (isBlockedCreatorName(creatorName)) {
    return null;
  }

  const normalizedName = normalizeName(creatorName);

  let creator = await findExistingCreator({
    username: item.username,
    normalizedName
  });

  const sourceUrl = item.profileUrl || `https://instagram.com/${item.username}`;

  if (!creator) {
    const slug = await generateUniqueSlug(creatorName, pool);

    const inserted = await pool.query(
      `
      insert into creators (
        name,
        slug,
        creator_type,
        normalized_name,
        primary_platform,
        primary_source_url,
        discovery_confidence,
        classification,
        last_discovered_at,
        auto_claim_ready
      )
      values ($1, $2, $3, $4, 'instagram', $5, $6, $7, now(), false)
      returning *
      `,
      [
        creatorName,
        slug,
        "individual",
        normalizedName,
        sourceUrl,
        classification.score,
        classification.label
      ]
    );

    creator = inserted.rows[0];
  } else {
    // Update only if Instagram provides higher confidence
    const updated = await pool.query(
      `
      update creators
      set
        normalized_name = coalesce(creators.normalized_name, $2),
        discovery_confidence = greatest(coalesce(creators.discovery_confidence, 0), $4),
        classification = case
          when coalesce(creators.discovery_confidence, 0) <= $4 then $5
          else creators.classification
        end,
        last_discovered_at = now()
      where id = $1
      returning *
      `,
      [
        creator.id,
        normalizedName,
        sourceUrl,
        classification.score,
        classification.label
      ]
    );

    creator = updated.rows[0];
  }

  // Extract contacts from bio
  const bioContacts = extractContacts(item.bio || "");
  
  // Add Instagram profile
  const allContacts = [
    { type: "instagram", value: sourceUrl },
    ...bioContacts
  ];

  // Add external URL if present
  if (item.externalUrl) {
    allContacts.push({ type: "website", value: item.externalUrl });
  }

  const contacts = await saveContacts(creator.id, sourceUrl, allContacts);

  // Link source to creator
  await pool.query(
    `
    update creator_sources
    set
      creator_id = $1,
      contact_found = $2,
      updated_at = now()
    where id = $3
    `,
    [creator.id, contacts.length > 0, sourceRow.id]
  );

  // Update claim ready
  const hasEmail = contacts.some((c) => c.type === "email");
  const hasWebsite = contacts.some((c) => c.type === "website");

  if (classification.score >= 70 && (hasEmail || hasWebsite)) {
    await pool.query(
      `update creators set auto_claim_ready = true where id = $1`,
      [creator.id]
    );
  }

  return creator;
}

module.exports = {
  upsertCreatorFromInstagram
};
