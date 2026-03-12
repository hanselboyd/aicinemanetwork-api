const pool = require("../db/pool");

const DEFAULT_LIMIT = 100;

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function dedupeBySlug(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    const slug = slugify(item.slug || item.name);
    if (!slug) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      ...item,
      slug
    });
  }

  return out;
}

/**
 * Version 1 discovery sources.
 * Start with curated creator leads you already know or can keep adding to.
 * Later you can swap this for YouTube / Reddit / festival scraping.
 */
function getDiscoverySources() {
  return [
    {
      name: "Front Door Network",
      creator_type: "collective",
      bio: "The AI Cinema Network — curated AI films and creators.",
      location: "California",
      website_url: "https://frontdoormedia.org",
      social_links: {},
      tags: ["ai cinema", "network"],
      verified: true,
      featured: true,
      published: true,
      discovered_from: "seed_curated"
    },
    {
      name: "AI Indie Director",
      creator_type: "individual",
      bio: "Independent filmmaker creating cinematic AI narratives.",
      location: "Los Angeles",
      website_url: null,
      social_links: {},
      tags: ["ai film", "indie"],
      verified: false,
      featured: false,
      published: true,
      discovered_from: "seed_curated"
    },

    /**
     * Add real filmmaker/studio leads here.
     * Example:
     *
     * {
     *   name: "Example Creator",
     *   creator_type: "individual",
     *   bio: "AI filmmaker and director.",
     *   location: "New York",
     *   website_url: "https://example.com",
     *   social_links: {
     *     instagram: "https://instagram.com/example",
     *     youtube: "https://youtube.com/@example"
     *   },
     *   tags: ["ai film", "director"],
     *   verified: false,
     *   featured: false,
     *   published: true,
     *   discovered_from: "manual_curated"
     * }
     */
  ];
}

async function ensureDiscoveryColumns() {
  await pool.query(`
    ALTER TABLE creators
    ADD COLUMN IF NOT EXISTS discovered_from TEXT,
    ADD COLUMN IF NOT EXISTS discovery_source_url TEXT
  `);
}

async function insertCreator(creator) {
  const sql = `
    INSERT INTO creators (
      name,
      slug,
      creator_type,
      bio,
      location,
      website_url,
      social_links,
      tags,
      verified,
      featured,
      published,
      discovered_from
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
    )
    ON CONFLICT (slug) DO UPDATE
    SET
      name = EXCLUDED.name,
      creator_type = COALESCE(creators.creator_type, EXCLUDED.creator_type),
      bio = COALESCE(creators.bio, EXCLUDED.bio),
      location = COALESCE(creators.location, EXCLUDED.location),
      website_url = COALESCE(creators.website_url, EXCLUDED.website_url),
      social_links = CASE
        WHEN creators.social_links IS NULL OR creators.social_links = '{}'::jsonb
          THEN EXCLUDED.social_links
        ELSE creators.social_links || EXCLUDED.social_links
      END,
      tags = (
        SELECT ARRAY(
          SELECT DISTINCT unnest(
            COALESCE(creators.tags, ARRAY[]::text[]) ||
            COALESCE(EXCLUDED.tags, ARRAY[]::text[])
          )
        )
      ),
      discovered_from = COALESCE(creators.discovered_from, EXCLUDED.discovered_from),
      updated_at = NOW()
    RETURNING id, name, slug
  `;

  const values = [
    creator.name,
    creator.slug,
    creator.creator_type || "individual",
    creator.bio || null,
    creator.location || null,
    normalizeUrl(creator.website_url),
    creator.social_links || {},
    creator.tags || [],
    Boolean(creator.verified),
    Boolean(creator.featured),
    creator.published !== false,
    creator.discovered_from || "manual_discovery"
  ];

  const { rows } = await pool.query(sql, values);
  return rows[0];
}

async function run() {
  console.log("[DiscoverCreators] Starting discovery run...");

  await ensureDiscoveryColumns();

  const rawSources = getDiscoverySources();
  const creators = dedupeBySlug(rawSources).slice(
    0,
    parseInt(process.env.DISCOVERY_LIMIT || `${DEFAULT_LIMIT}`, 10)
  );

  console.log(`[DiscoverCreators] Prepared ${creators.length} creator candidate(s).`);

  let insertedOrUpdated = 0;
  let failed = 0;

  for (const creator of creators) {
    try {
      if (!creator.name) continue;

      const result = await insertCreator({
        ...creator,
        slug: creator.slug || slugify(creator.name),
        claim_outreach_status: "not_ready"
      });

      insertedOrUpdated += 1;
      console.log(
        `[DiscoverCreators] Upserted creator: ${result.name} (${result.slug})`
      );
    } catch (error) {
      failed += 1;
      console.error(
        `[DiscoverCreators] Failed for ${creator.name || "unknown"}:`,
        error.message
      );
    }
  }

  console.log("[DiscoverCreators] Complete.");
  console.log({
    processed: creators.length,
    inserted_or_updated: insertedOrUpdated,
    failed
  });

  await pool.end();
}

run().catch(async (error) => {
  console.error("[DiscoverCreators] Fatal error:", error);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
