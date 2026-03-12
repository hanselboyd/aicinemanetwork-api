const pool = require("../db/pool");

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

  if (!compact) {
    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
      hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
    }
    return `creator-${String(hash).slice(0, 6)}`;
  }

  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }

  return `creator-${compact.toLowerCase()}-${String(hash).slice(0, 6)}`;
}

async function generateUniqueSlug(baseText, creatorId) {
  const plainSlug = slugify(baseText);
  const baseSlug = plainSlug || fallbackSlugSeed(baseText);

  const exact = await pool.query(
    `
    select id
    from creators
    where slug = $1
      and id <> $2
    limit 1
    `,
    [baseSlug, creatorId]
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
        and id <> $2
      limit 1
      `,
      [candidate, creatorId]
    );

    if (!result.rows.length) {
      return candidate;
    }
  }

  return `${baseSlug}-${Date.now()}`;
}

async function reclassifyYouTubeCreators() {
  const creatorsRes = await pool.query(
    `
    select id, name, slug
    from creators
    where primary_platform = 'youtube'
    order by last_discovered_at desc nulls last
    `
  );

  let processed = 0;
  let updated = 0;
  let slugFixed = 0;

  for (const creator of creatorsRes.rows) {
    processed += 1;

    const sourceRes = await pool.query(
      `
      select
        id,
        creator_id,
        source_url,
        title,
        description,
        confidence_score,
        classifier_label,
        metadata,
        updated_at
      from creator_sources
      where creator_id = $1
        and source_platform = 'youtube'
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
  select contact_type, contact_value
  from creator_contacts
  where creator_id = $1
  `,
  [creator.id]
);

const contacts = contactsRes.rows || [];
const hasEmail = contacts.some((c) => c.contact_type === "email");
const hasWebsiteLike = contacts.some((c) =>
  ["website", "instagram", "x", "tiktok", "vimeo"].includes(c.contact_type)
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

    if (
      !creator.slug ||
      creator.slug === "creator" ||
      creator.slug === "creator-2" ||
      creator.slug === "creator-3"
    ) {
      const newSlug = await generateUniqueSlug(creator.name, creator.id);

      await pool.query(
        `
        update creators
        set slug = $2
        where id = $1
        `,
        [creator.id, newSlug]
      );

      slugFixed += 1;
    }
  }

  return {
    processed,
    updated,
    slugFixed
  };
}

reclassifyYouTubeCreators()
  .then((result) => {
    console.log("YouTube creator reclassification complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("YouTube creator reclassification failed:", error);
    process.exit(1);
  });
