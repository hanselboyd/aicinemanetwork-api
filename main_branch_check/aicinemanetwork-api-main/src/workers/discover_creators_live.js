const pool = require("../db/pool");

const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_LIMIT = 50;

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

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "AICinemaNetwork-DiscoveryWorker/1.0",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function ensureDiscoveryColumns() {
  await pool.query(`
    ALTER TABLE creators
    ADD COLUMN IF NOT EXISTS discovered_from TEXT,
    ADD COLUMN IF NOT EXISTS discovery_source_url TEXT
  `);
}

async function upsertCreator(creator) {
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
      discovered_from,
      discovery_source_url,
      claim_outreach_status,
      claim_outreach_ready
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
    )
    ON CONFLICT (slug) DO UPDATE
    SET
      name = EXCLUDED.name,
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
      discovery_source_url = COALESCE(creators.discovery_source_url, EXCLUDED.discovery_source_url),
      updated_at = NOW()
    RETURNING id, name, slug
  `;

  const values = [
    creator.name,
    slugify(creator.name),
    creator.creator_type || "individual",
    creator.bio || null,
    creator.location || null,
    normalizeUrl(creator.website_url),
    creator.social_links || {},
    creator.tags || ["ai film"],
    false,
    false,
    true,
    creator.discovered_from,
    creator.discovery_source_url || null,
    "not_ready",
    false
  ];

  const { rows } = await pool.query(sql, values);
  return rows[0];
}

function parseYouTubeHandles(html) {
  const creators = [];
  const regex = /"ownerText":\{"runs":\[\{"text":"([^"]+)".*?"navigationEndpoint":\{"browseEndpoint":\{"browseId":"([^"]+)"/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const name = match[1];
    const browseId = match[2];

    if (!name) continue;

    creators.push({
      name,
      creator_type: "individual",
      tags: ["ai film", "youtube"],
      social_links: {},
      discovered_from: "youtube_search",
      discovery_source_url: `https://www.youtube.com/channel/${browseId}`
    });
  }

  return creators;
}

function parseRedditAuthors(html, sourceUrl) {
  const creators = [];
  const regex = /"author":"([^"]+)"/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const author = match[1];
    if (!author) continue;
    if (author === "[deleted]") continue;

    creators.push({
      name: author,
      creator_type: "individual",
      tags: ["ai film", "reddit"],
      social_links: {
        reddit: `https://www.reddit.com/user/${author}`
      },
      discovered_from: "reddit_search",
      discovery_source_url: sourceUrl
    });
  }

  return creators;
}

async function discoverFromYouTube() {
  const queries = [
    "AI short film",
    "Runway short film",
    "AI filmmaker",
    "AI cinema"
  ];

  let results = [];

  for (const query of queries) {
    try {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;

      const html = await res.text();
      const found = parseYouTubeHandles(html).map((c) => ({
        ...c,
        discovery_source_url: url
      }));

      results.push(...found);
    } catch (err) {
      console.error(`[DiscoverLive] YouTube error for "${query}":`, err.message);
    }
  }

  return results;
}

async function discoverFromReddit() {
  const urls = [
    "https://www.reddit.com/search/?q=AI%20short%20film",
    "https://www.reddit.com/search/?q=Runway%20film",
    "https://www.reddit.com/search/?q=AI%20filmmaker",
    "https://www.reddit.com/r/aivideo/"
  ];

  let results = [];

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;

      const html = await res.text();
      results.push(...parseRedditAuthors(html, url));
    } catch (err) {
      console.error(`[DiscoverLive] Reddit error for "${url}":`, err.message);
    }
  }

  return results;
}

function dedupeCreators(creators) {
  const seen = new Set();
  const out = [];

  for (const creator of creators) {
    const slug = slugify(creator.name);
    if (!slug) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(creator);
  }

  return out;
}

async function run() {
  console.log("[DiscoverLive] Starting live creator discovery...");

  await ensureDiscoveryColumns();

  const [youtubeCreators, redditCreators] = await Promise.all([
    discoverFromYouTube(),
    discoverFromReddit()
  ]);

  const merged = dedupeCreators([...youtubeCreators, ...redditCreators]).slice(0, DEFAULT_LIMIT);

  console.log(`[DiscoverLive] Found ${merged.length} unique creator candidate(s).`);

  let inserted = 0;
  let failed = 0;

  for (const creator of merged) {
    try {
      const result = await upsertCreator(creator);
      inserted += 1;
      console.log(`[DiscoverLive] Upserted: ${result.name} (${result.slug})`);
    } catch (err) {
      failed += 1;
      console.error(`[DiscoverLive] Failed for ${creator.name}:`, err.message);
    }
  }

  console.log("[DiscoverLive] Complete.");
  console.log({
    discovered: merged.length,
    inserted_or_updated: inserted,
    failed
  });

  await pool.end();
}

run().catch(async (err) => {
  console.error("[DiscoverLive] Fatal error:", err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
