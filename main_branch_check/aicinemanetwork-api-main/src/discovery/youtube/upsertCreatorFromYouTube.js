const pool = require("../../db/pool");
const { enrichYouTubeContacts } = require("./enrichYouTubeContacts");

const BLOCKED_CREATOR_NAMES = [
  "runway",
  "openai",
  "midjourney",
  "pika",
  "kling",
  "sora",
  "adobe",
  "canva",
  "stability ai",
  "luma",
  "veo",
  "google ai"
];

function isBlockedCreatorName(name) {
  const lower = String(name || "").toLowerCase().trim();
  return BLOCKED_CREATOR_NAMES.includes(lower);
}

function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(text) {
  const slug = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .trim();

  return slug;
}

function fallbackSlugSeed(text) {
  const raw = (text || "").trim();
  if (!raw) return "creator";

  const compact = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 12);

  if (!compact) return "creator";

  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }

  return `creator-${compact.toLowerCase()}-${String(hash).slice(0, 6)}`;
}

async function generateUniqueSlug(baseText) {
  const plainSlug = slugify(baseText);
  const baseSlug = plainSlug || fallbackSlugSeed(baseText);

  const exact = await pool.query(
    `
    select id
    from creators
    where slug = $1
    limit 1
    `,
    [baseSlug]
  );

  if (!exact.rows.length) {
    return baseSlug;
  }

  for (let i = 2; i <= 1000; i += 1) {
    const candidate = `${baseSlug}-${i}`;

    const result = await pool.query(
      `
      select id
      from creators
      where slug = $1
      limit 1
      `,
      [candidate]
    );

    if (!result.rows.length) {
      return candidate;
    }
  }

  return `${baseSlug}-${Date.now()}`;
}

async function findExistingCreator({ channelId, channelHandle, normalizedName }) {
  const bySource = await pool.query(
    `
    select c.*
    from creators c
    join creator_sources s on s.creator_id = c.id
    where s.source_platform = 'youtube'
      and (
        s.external_id = $1
        or s.handle = $2
      )
    limit 1
    `,
    [channelId || null, channelHandle || null]
  );

  if (bySource.rows.length) {
    return bySource.rows[0];
  }

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
      values ($1, $2, $3, 'youtube', $4, false, now(), now())
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

async function upsertCreatorFromYouTube(sourceRow, item, classification) {
  const channelName = item.channelTitle || "Unknown Creator";

  if (isBlockedCreatorName(channelName)) {
    return null;
  }

  const normalizedName = normalizeName(channelName);

  let creator = await findExistingCreator({
    channelId: item.channelId,
    channelHandle: item.channelHandle,
    normalizedName
  });

  if (!creator) {
    const slug = await generateUniqueSlug(channelName);

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
      values ($1, $2, $3, $4, 'youtube', $5, $6, $7, now(), false)
      returning *
      `,
      [
        channelName,
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
    const updated = await pool.query(
      `
      update creators
      set
        normalized_name = coalesce(creators.normalized_name, $2),
        primary_platform = coalesce(creators.primary_platform, 'youtube'),
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

  const enrichment = await enrichYouTubeContacts(item);
  const contacts = await saveContacts(
    creator.id,
    item.url || sourceRow.source_url,
    enrichment.contacts || []
  );

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

  const hasEmail = contacts.some((c) => c.type === "email");
  const hasWebsiteLike = contacts.some((c) =>
    ["website", "instagram", "x", "tiktok", "vimeo"].includes(c.type)
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
  upsertCreatorFromYouTube
};
