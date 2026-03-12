const pool = require("../../db/pool");
const { enrichVimeoContacts } = require("./enrichVimeoContacts");
const { isBlockedCreatorName } = require("../shared/blockedCreatorNames");
const { normalizeName, generateUniqueSlug } = require("../shared/entityUtils");

async function findExistingCreator({ creatorId, creatorHandle, normalizedName }) {
  // First try to find by Vimeo source
  const bySource = await pool.query(
    `
    select c.*
    from creators c
    join creator_sources s on s.creator_id = c.id
    where s.source_platform = 'vimeo'
      and (
        s.external_id = $1
        or s.handle = $2
      )
    limit 1
    `,
    [creatorId || null, creatorHandle || null]
  );

  if (bySource.rows.length) {
    return bySource.rows[0];
  }

  // Then try to match by normalized name
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
      values ($1, $2, $3, 'vimeo', $4, false, now(), now())
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

async function upsertCreatorFromVimeo(sourceRow, item, classification) {
  const creatorName = item.creatorTitle || "Unknown Creator";

  if (isBlockedCreatorName(creatorName)) {
    return null;
  }

  const normalizedName = normalizeName(creatorName);

  let creator = await findExistingCreator({
    creatorId: item.creatorId,
    creatorHandle: item.creatorHandle,
    normalizedName
  });

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
      values ($1, $2, $3, $4, 'vimeo', $5, $6, $7, now(), false)
      returning *
      `,
      [
        creatorName,
        slug,
        "individual",
        normalizedName,
        item.url || null,
        classification.score,
        classification.label
      ]
    );

    creator = inserted.rows[0];
  } else {
    // Update existing creator - prefer higher confidence
    const updated = await pool.query(
      `
      update creators
      set
        normalized_name = coalesce(creators.normalized_name, $2),
        primary_platform = case
          when creators.primary_platform is null then 'vimeo'
          else creators.primary_platform
        end,
        primary_source_url = coalesce(creators.primary_source_url, $3),
        discovery_confidence = greatest(coalesce(creators.discovery_confidence, 0), $4),
        classification = case
          when coalesce(creators.discovery_confidence, 0) <= $4 then $5
          else creators.classification
        end,
        last_discovered_at = now(),
        auto_claim_ready = creators.auto_claim_ready
      where id = $1
      returning *
      `,
      [
        creator.id,
        normalizedName,
        item.url || null,
        classification.score,
        classification.label
      ]
    );

    creator = updated.rows[0];
  }

  // Enrich contacts
  const enrichment = await enrichVimeoContacts(item);
  const contacts = await saveContacts(
    creator.id,
    item.url || sourceRow.source_url,
    enrichment.contacts || []
  );

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

  // Update claim ready status
  const hasEmail = contacts.some((c) => c.type === "email");
  const hasWebsiteLike = contacts.some((c) =>
    ["website", "instagram", "x", "tiktok", "youtube"].includes(c.type)
  );

  const shouldMarkClaimReady =
    classification.score >= 70 && (hasEmail || hasWebsiteLike);

  if (shouldMarkClaimReady) {
    await pool.query(
      `
      update creators
      set auto_claim_ready = true
      where id = $1
      `,
      [creator.id]
    );
  }

  return creator;
}

module.exports = {
  upsertCreatorFromVimeo
};
