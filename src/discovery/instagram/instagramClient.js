// Instagram client using DuckDuckGo search + Instagram mobile API
//
// Architecture:
//   Phase 1: DuckDuckGo HTML search finds Instagram profile URLs
//   Phase 2: Instagram's i.instagram.com mobile API returns full profile data
//
// Both work reliably from cloud IPs (unlike Instagram's web endpoints).

const DDG_BASE = "https://html.duckduckgo.com/html/";
const IG_API_BASE = "https://i.instagram.com/api/v1";
const DDG_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const IG_UA = "Instagram 275.0.0.27.98 Android";

const MIN_DDG_INTERVAL_MS = 3000;
const MIN_IG_INTERVAL_MS = 5000; // Conservative: IG mobile API is strict
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_PROFILES_PER_QUERY = 10; // Cap enrichment per query

let lastDdgRequest = 0;
let lastIgRequest = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────
// DuckDuckGo search helpers
// ──────────────────────────────────────────────

const SKIP_USERNAMES = new Set([
  "p",
  "reel",
  "reels",
  "explore",
  "accounts",
  "stories",
  "about",
  "legal",
  "privacy",
  "terms",
  "developer",
  "directory",
  "direct",
  "static",
  "help",
  "nametag",
  "tv",
  "web",
  "api",
  "graphql",
  "tags"
]);

/**
 * Extract Instagram usernames from HTML page content
 */
function extractUsernamesFromHtml(html) {
  const matches = html.match(/instagram\.com\/([a-zA-Z0-9_.]+)\/?/g) || [];
  const usernames = new Set();

  for (const match of matches) {
    const uMatch = match.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
    if (!uMatch) continue;

    const username = uMatch[1].toLowerCase();

    if (SKIP_USERNAMES.has(username)) continue;
    if (username.length < 3 || username.length > 30) continue;

    usernames.add(username);
  }

  return [...usernames];
}

/**
 * Also extract bio snippets from DDG result descriptions.
 * DDG embeds truncated profile descriptions in search results.
 */
function extractSnippets(html) {
  const snippets = {};
  const resultBlocks = html.split('class="result__body"');

  for (let i = 1; i < resultBlocks.length; i++) {
    const block = resultBlocks[i].split("</div>")[0] || "";

    // Find the link URL
    const urlMatch = block.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
    if (!urlMatch) continue;

    const username = urlMatch[1].toLowerCase();
    if (SKIP_USERNAMES.has(username)) continue;

    // Find the snippet text
    const snippetMatch = block.match(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/
    );
    if (snippetMatch) {
      const text = snippetMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length > 20) {
        snippets[username] = text;
      }
    }
  }

  return snippets;
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

      if (response.status === 429) {
        console.warn("[instagramClient] DDG rate limited");
        if (attempt < MAX_RETRIES) {
          await sleep(30000);
          continue;
        }
        return null;
      }

      if (!response.ok) {
        console.warn(
          `[instagramClient] DDG returned ${response.status}`
        );
        return null;
      }

      return await response.text();
    } catch (err) {
      if (attempt < MAX_RETRIES) continue;
      console.error(
        `[instagramClient] DDG fetch error: ${err.message}`
      );
      return null;
    }
  }
}

// ──────────────────────────────────────────────
// Instagram mobile API helpers
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
        if (attempt < MAX_RETRIES) {
          const backoff = (attempt + 1) * 120000; // 2min, 4min
          console.warn(`[instagramClient] Backing off ${backoff / 1000}s`);
          await sleep(backoff);
          continue;
        }
        const err = new Error("Instagram API rate limit exceeded");
        err.isRateLimit = true;
        throw err;
      }

      if (response.status === 404) {
        return null; // Profile not found
      }

      if (!response.ok) {
        // Instagram sometimes returns HTML error pages
        const text = await response.text();
        if (text.includes("Page Not Found")) return null;
        console.warn(
          `[instagramClient] IG API returned ${response.status}`
        );
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("json")) {
        // Got HTML instead of JSON — profile may not exist
        return null;
      }

      return await response.json();
    } catch (err) {
      if (err.isRateLimit) throw err;
      if (attempt < MAX_RETRIES) continue;
      console.error(
        `[instagramClient] IG API error: ${err.message}`
      );
      return null;
    }
  }
}

/**
 * Parse IG API response into a normalized profile object
 */
function normalizeProfile(data) {
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
    isPrivate: user.is_private || false
  };
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Search for Instagram profiles matching a query.
 * Uses DuckDuckGo to find profile URLs, then enriches via IG mobile API.
 *
 * @param {string} query - Search term (e.g. "AI filmmaker")
 * @returns {Array} Normalized profile objects with full bio, stats
 */
async function searchInstagramProfiles(query) {
  // Phase 1: DuckDuckGo search to find Instagram usernames
  const searchQuery = `${query} instagram`;
  const url = `${DDG_BASE}?q=${encodeURIComponent(searchQuery)}`;

  const html = await ddgFetch(url);
  if (!html) return [];

  const usernames = extractUsernamesFromHtml(html);
  if (usernames.length === 0) return [];

  console.log(
    `[instagramClient] DDG found ${usernames.length} usernames for "${query}": ${usernames.slice(0, 8).join(", ")}`
  );

  // Phase 2: Enrich each username via IG mobile API
  const profiles = [];
  const toEnrich = usernames.slice(0, MAX_PROFILES_PER_QUERY);

  for (const username of toEnrich) {
    try {
      const data = await igApiFetch(
        `${IG_API_BASE}/users/web_profile_info/?username=${encodeURIComponent(username)}`
      );

      if (!data) {
        console.log(
          `[instagramClient] @${username} — not found or error`
        );
        continue;
      }

      const profile = normalizeProfile(data);
      if (!profile) continue;

      // Skip private accounts — can't verify their content
      if (profile.isPrivate) {
        console.log(
          `[instagramClient] @${username} — private, skipping`
        );
        continue;
      }

      profiles.push(profile);
    } catch (err) {
      if (err.isRateLimit) {
        console.warn(
          `[instagramClient] Rate limited during enrichment. Stopping with ${profiles.length} profiles.`
        );
        // Return partial results with rate limit flag
        profiles.rateLimitHit = true;
        return profiles;
      }
      console.error(
        `[instagramClient] Error enriching @${username}: ${err.message}`
      );
    }
  }

  return profiles;
}

/**
 * Get a single Instagram profile by username
 */
async function getInstagramProfile(username) {
  if (!username) return null;

  const cleaned = username.replace(/^@/, "").toLowerCase();
  const data = await igApiFetch(
    `${IG_API_BASE}/users/web_profile_info/?username=${encodeURIComponent(cleaned)}`
  );

  if (!data) return null;
  return normalizeProfile(data);
}

/**
 * Get recent posts for a username.
 * Note: The mobile API returns limited post data in the profile response.
 * Full post fetching would require authenticated requests.
 * Returns whatever is available in the profile edge data.
 */
async function getInstagramRecentPosts(username, limit = 10) {
  // The profile endpoint includes edge_owner_to_timeline_media
  // with recent posts. We extract what's available.
  if (!username) return [];

  const cleaned = username.replace(/^@/, "").toLowerCase();
  const data = await igApiFetch(
    `${IG_API_BASE}/users/web_profile_info/?username=${encodeURIComponent(cleaned)}`
  );

  if (!data?.data?.user) return [];

  const edges =
    data.data.user.edge_owner_to_timeline_media?.edges || [];

  return edges.slice(0, limit).map((edge) => {
    const node = edge.node || {};
    return {
      shortcode: node.shortcode || null,
      postUrl: node.shortcode
        ? `https://www.instagram.com/p/${node.shortcode}/`
        : null,
      caption:
        node.edge_media_to_caption?.edges?.[0]?.node?.text || "",
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
