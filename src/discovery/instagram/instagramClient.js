// Instagram discovery via DuckDuckGo search + optional IG mobile API enrichment.
//
// Two-tier architecture:
//   Tier 1 (DDG, always works): DuckDuckGo search → parse snippets for
//     username, full name, follower/following/post counts, truncated bio.
//     Reliable from any IP. Enough data for classification.
//
//   Tier 2 (IG API, optional): i.instagram.com mobile API → full bio,
//     external URL, verification, category, profile pic.
//     Rate-limited; skipped automatically if unavailable.

const DDG_BASE = "https://html.duckduckgo.com/html/";
const IG_API_BASE = "https://i.instagram.com/api/v1";
const DDG_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const IG_UA = "Instagram 275.0.0.27.98 Android";

const MIN_DDG_INTERVAL_MS = 3000;
const MIN_IG_INTERVAL_MS = 5000;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_PROFILES_PER_QUERY = 10;

let lastDdgRequest = 0;
let lastIgRequest = 0;
let igApiAvailable = true; // Disabled on first 429

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────
// DuckDuckGo search + snippet parsing
// ──────────────────────────────────────────────

const SKIP_USERNAMES = new Set([
  "p", "reel", "reels", "explore", "accounts", "stories", "about",
  "legal", "privacy", "terms", "developer", "directory", "direct",
  "static", "help", "nametag", "tv", "web", "api", "graphql", "tags"
]);

/**
 * Decode HTML entities
 */
function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Parse a DDG search result snippet into a profile object.
 *
 * DDG format for Instagram profiles:
 *   Title: "Full Name (@username) • Instagram photos and videos"
 *   Snippet: "80K Followers, 0 Following, 72 Posts - Full Name (@username)
 *            on Instagram: "bio text here...""
 */
function parseSnippetProfile(title, snippet, urlUsername) {
  const clean = (s) => decodeEntities((s || "").replace(/<[^>]+>/g, "").trim());
  title = clean(title);
  snippet = clean(snippet);

  // Extract username from title: "Name (@username) • ..."
  const titleUser = title.match(/@([a-zA-Z0-9_.]+)/);
  const username = (titleUser ? titleUser[1] : urlUsername || "").toLowerCase();
  if (!username || SKIP_USERNAMES.has(username) || username.length < 3) return null;

  // Extract full name from title: everything before (@username)
  let fullName = "";
  if (titleUser) {
    fullName = title.slice(0, title.indexOf("(@")).trim();
  }
  // Some titles have emoji-only names (like "🕉️"), keep them
  if (!fullName && title.includes("•")) {
    fullName = title.split("•")[0].replace(/@\S+/g, "").trim();
  }

  // Parse stats from snippet: "80K Followers, 0 Following, 72 Posts"
  let followerCount = 0;
  let followingCount = 0;
  let postCount = 0;

  const followerMatch = snippet.match(/([\d,.]+[KkMm]?)\s*Followers?/i);
  if (followerMatch) followerCount = parseShortNumber(followerMatch[1]);

  const followingMatch = snippet.match(/([\d,.]+[KkMm]?)\s*Following/i);
  if (followingMatch) followingCount = parseShortNumber(followingMatch[1]);

  const postMatch = snippet.match(/([\d,.]+[KkMm]?)\s*Posts?/i);
  if (postMatch) postCount = parseShortNumber(postMatch[1]);

  // Extract bio from snippet: text after "on Instagram: "
  let bio = "";
  const bioMatch = snippet.match(/on Instagram:\s*"([^"]*)/);
  if (bioMatch) {
    bio = bioMatch[1].trim();
  }

  return {
    username,
    userId: null,
    fullName: fullName || username,
    bio,
    externalUrl: null,
    profilePicUrl: null,
    profileUrl: `https://www.instagram.com/${username}/`,
    followerCount,
    followingCount,
    postCount,
    isVerified: false,
    isBusinessAccount: false,
    categoryName: null,
    isPrivate: false,
    enrichedVia: "ddg_snippet"
  };
}

/**
 * Parse short number formats: "80K" → 80000, "1.2M" → 1200000
 */
function parseShortNumber(str) {
  if (!str) return 0;
  const cleaned = str.replace(/,/g, "");
  const match = cleaned.match(/([\d.]+)\s*([KkMm])?/);
  if (!match) return 0;

  let num = parseFloat(match[1]);
  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "K") num *= 1000;
  if (suffix === "M") num *= 1000000;
  return Math.round(num);
}

async function ddgFetch(url) {
  const now = Date.now();
  const elapsed = now - lastDdgRequest;
  if (elapsed < MIN_DDG_INTERVAL_MS) {
    await sleep(MIN_DDG_INTERVAL_MS - elapsed);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(attempt * 5000);
      console.warn(`[instagramClient] DDG retry ${attempt}/${MAX_RETRIES}`);
    }

    lastDdgRequest = Date.now();

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": DDG_UA },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      if (response.status === 429 || response.status === 202) {
        console.warn(
          `[instagramClient] DDG rate limited (${response.status})`
        );
        if (attempt < MAX_RETRIES) {
          await sleep(30000);
          continue;
        }
        return null;
      }

      if (!response.ok) {
        console.warn(`[instagramClient] DDG returned ${response.status}`);
        return null;
      }

      // DDG sometimes returns 200 with bot-detection page
      const text = await response.text();
      if (text.includes("cc=botnet") || text.includes("blocked")) {
        console.warn("[instagramClient] DDG bot detection triggered");
        return null;
      }

      return text;

    } catch (err) {
      if (attempt < MAX_RETRIES) continue;
      console.error(`[instagramClient] DDG fetch error: ${err.message}`);
      return null;
    }
  }
}

/**
 * Parse all Instagram profiles from a DDG search results page.
 * Returns profile objects with data from snippets.
 */
function parseDdgResults(html) {
  const profiles = [];
  const seen = new Set();

  // Split by result blocks
  const blocks = html.split(/class="result\s/);

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Extract URL-based username
    const urlMatch = block.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
    if (!urlMatch) continue;
    const urlUsername = urlMatch[1].toLowerCase();
    if (SKIP_USERNAMES.has(urlUsername)) continue;

    // Extract title
    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const title = titleMatch ? titleMatch[1] : "";

    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const snippet = snippetMatch ? snippetMatch[1] : "";

    const profile = parseSnippetProfile(title, snippet, urlUsername);
    if (!profile) continue;
    if (seen.has(profile.username)) continue;
    seen.add(profile.username);

    profiles.push(profile);
  }

  return profiles;
}

// ──────────────────────────────────────────────
// Instagram mobile API (Tier 2 enrichment)
// ──────────────────────────────────────────────

async function igApiFetch(url) {
  const now = Date.now();
  const elapsed = now - lastIgRequest;
  if (elapsed < MIN_IG_INTERVAL_MS) {
    await sleep(MIN_IG_INTERVAL_MS - elapsed);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(attempt * 5000);
      console.warn(`[instagramClient] IG API retry ${attempt}/${MAX_RETRIES}`);
    }

    lastIgRequest = Date.now();

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": IG_UA },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      if (response.status === 429) {
        console.warn("[instagramClient] IG API rate limited (429)");
        igApiAvailable = false; // Disable for rest of this run
        return null;
      }

      if (response.status === 404) return null;

      if (!response.ok) {
        const text = await response.text();
        if (text.includes("Page Not Found")) return null;
        console.warn(`[instagramClient] IG API returned ${response.status}`);
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("json")) return null;

      return await response.json();
    } catch (err) {
      if (attempt < MAX_RETRIES) continue;
      console.error(`[instagramClient] IG API error: ${err.message}`);
      return null;
    }
  }
}

function normalizeApiProfile(data) {
  const user = data?.data?.user;
  if (!user) return null;

  return {
    username: user.username || null,
    userId: user.id || null,
    fullName: user.full_name || "",
    bio: user.biography || "",
    externalUrl: user.external_url || null,
    profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url || null,
    profileUrl: `https://www.instagram.com/${user.username}/`,
    followerCount: user.edge_followed_by?.count || 0,
    followingCount: user.edge_follow?.count || 0,
    postCount: user.edge_owner_to_timeline_media?.count || 0,
    isVerified: user.is_verified || false,
    isBusinessAccount: user.is_business_account || false,
    categoryName: user.category_name || null,
    isPrivate: user.is_private || false,
    enrichedVia: "ig_api"
  };
}

/**
 * Try to enrich a DDG-discovered profile with full IG API data.
 * Returns enriched profile if successful, or original profile.
 */
async function tryEnrichProfile(ddgProfile) {
  if (!igApiAvailable) return ddgProfile;
  if (!ddgProfile.username) return ddgProfile;

  try {
    const data = await igApiFetch(
      `${IG_API_BASE}/users/web_profile_info/?username=${encodeURIComponent(ddgProfile.username)}`
    );

    if (!data) return ddgProfile;
    const enriched = normalizeApiProfile(data);
    if (!enriched) return ddgProfile;
    if (enriched.isPrivate) return null; // Skip private

    return enriched;
  } catch {
    return ddgProfile;
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Search for Instagram profiles matching a query.
 *
 * Tier 1: DuckDuckGo search → parse snippets (always works)
 * Tier 2: IG mobile API enrichment (optional, skipped if rate limited)
 *
 * @param {string} query - Search term (e.g. "AI filmmaker")
 * @returns {Array} Profile objects
 */
async function searchInstagramProfiles(query) {
  // Tier 1: DuckDuckGo search
  const searchQuery = `${query} instagram`;
  const url = `${DDG_BASE}?q=${encodeURIComponent(searchQuery)}`;

  const html = await ddgFetch(url);
  if (!html) return [];

  const ddgProfiles = parseDdgResults(html).slice(0, MAX_PROFILES_PER_QUERY);

  if (ddgProfiles.length === 0) return [];

  console.log(
    `[instagramClient] DDG found ${ddgProfiles.length} profiles for "${query}": ${ddgProfiles.map((p) => "@" + p.username).join(", ")}`
  );

  // Tier 2: Optional IG API enrichment
  const profiles = [];
  let enrichCount = 0;

  for (const ddgProfile of ddgProfiles) {
    const enriched = await tryEnrichProfile(ddgProfile);
    if (!enriched) continue; // null = private account, skip

    if (enriched.enrichedVia === "ig_api") enrichCount++;
    profiles.push(enriched);
  }

  if (enrichCount > 0) {
    console.log(
      `[instagramClient] Enriched ${enrichCount}/${profiles.length} profiles via IG API`
    );
  }

  return profiles;
}

/**
 * Get a single Instagram profile by username
 */
async function getInstagramProfile(username) {
  if (!username) return null;

  const cleaned = username.replace(/^@/, "").toLowerCase();

  // Try IG API first
  if (igApiAvailable) {
    const data = await igApiFetch(
      `${IG_API_BASE}/users/web_profile_info/?username=${encodeURIComponent(cleaned)}`
    );

    if (data) {
      const profile = normalizeApiProfile(data);
      if (profile) return profile;
    }
  }

  // Fallback: DDG search
  const url = `${DDG_BASE}?q=${encodeURIComponent(`@${cleaned} site:instagram.com`)}`;
  const html = await ddgFetch(url);
  if (!html) return null;

  const profiles = parseDdgResults(html);
  return profiles.find((p) => p.username === cleaned) || null;
}

/**
 * Get recent posts for a username (requires IG API, not available via DDG)
 */
async function getInstagramRecentPosts(username, limit = 10) {
  if (!username || !igApiAvailable) return [];

  const cleaned = username.replace(/^@/, "").toLowerCase();
  const data = await igApiFetch(
    `${IG_API_BASE}/users/web_profile_info/?username=${encodeURIComponent(cleaned)}`
  );

  if (!data?.data?.user) return [];

  const edges = data.data.user.edge_owner_to_timeline_media?.edges || [];
  return edges.slice(0, limit).map((edge) => {
    const node = edge.node || {};
    return {
      shortcode: node.shortcode || null,
      postUrl: node.shortcode
        ? `https://www.instagram.com/p/${node.shortcode}/`
        : null,
      caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || "",
      timestamp: node.taken_at_timestamp || null,
      likeCount: node.edge_liked_by?.count || 0,
      commentCount: node.edge_media_to_comment?.count || 0,
      isVideo: node.is_video || false,
      videoViewCount: node.video_view_count || 0,
      thumbnailUrl: node.thumbnail_src || node.display_url || null
    };
  });
}

module.exports = {
  searchInstagramProfiles,
  getInstagramProfile,
  getInstagramRecentPosts
};
