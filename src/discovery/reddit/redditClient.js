// Reddit client using public RSS/Atom feeds (reliable on cloud IPs)
// JSON API is blocked by Reddit on many cloud providers; RSS feeds are unaffected.

const REDDIT_BASE = "https://www.reddit.com";
const USER_AGENT =
  "AIcinemaNetwork:discovery-crawler/1.0 (automated; ai-cinema-research)";

// Reddit rate limits: ~100 requests per minute for RSS, but we stay conservative
const MIN_REQUEST_INTERVAL_MS = 2000;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15000;

let lastRequestTime = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────
// XML / HTML helpers
// ──────────────────────────────────────────────

function decodeXmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#32;/g, " ");
}

/**
 * Extract plain text from HTML (strip tags)
 */
function htmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract the post's target URL from decoded HTML content.
 * Reddit RSS embeds: <a href="URL">[link]</a> for the post URL
 */
function extractPostUrl(decodedHtml) {
  if (!decodedHtml) return null;

  // Pattern: <a href="URL">[link]</a>  — this is the post's external URL
  const linkMatch = decodedHtml.match(
    /<a\s+href="([^"]+)">\[link\]<\/a>/
  );
  if (linkMatch) return linkMatch[1];

  return null;
}

/**
 * Extract all external (non-Reddit) URLs from decoded HTML content
 */
function extractExternalLinks(decodedHtml) {
  if (!decodedHtml) return [];

  const hrefMatches = decodedHtml.match(/href="([^"]+)"/g) || [];
  const urls = hrefMatches
    .map((m) => m.slice(6, -1))
    .filter((url) => url.startsWith("http"))
    .filter(
      (url) =>
        !url.includes("reddit.com") &&
        !url.includes("redditstatic.com")
    );

  return [...new Set(urls)];
}

/**
 * Extract subreddit from permalink or HTML content
 */
function extractSubreddit(permalink, decodedHtml) {
  // From permalink: /r/aivideo/comments/... → aivideo
  if (permalink) {
    const match = permalink.match(/\/r\/([^/]+)/);
    if (match) return match[1];
  }

  // From HTML: look for /r/subreddit link
  if (decodedHtml) {
    const match = decodedHtml.match(
      /href="https?:\/\/www\.reddit\.com\/r\/([^/"]+)"/
    );
    if (match) return match[1];
  }

  return null;
}

// ──────────────────────────────────────────────
// Atom XML Parsing
// ──────────────────────────────────────────────

function parseAtomFeed(xml) {
  const entries = [];
  const entryBlocks = xml.split("<entry>");

  for (let i = 1; i < entryBlocks.length; i++) {
    const block = entryBlocks[i].split("</entry>")[0];
    if (!block) continue;

    // <id>t3_xxxxx</id>
    const idMatch = block.match(/<id>([^<]+)<\/id>/);
    const rawId = idMatch ? idMatch[1].trim() : null;

    // Skip non-post entries (subreddit descriptions start with t5_)
    if (!rawId || !rawId.startsWith("t3_")) continue;

    // <title>...</title>
    const titleMatch = block.match(/<title>([^<]*)<\/title>/);
    const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : "";

    // <author><name>/u/username</name>...</author>
    const authorMatch = block.match(/<name>([^<]+)<\/name>/);
    const author = authorMatch ? authorMatch[1].trim() : null;

    // <link href="..." />
    const linkMatch = block.match(/<link\s+href="([^"]+)"/);
    const link = linkMatch ? linkMatch[1] : null;

    // <category term="subreddit" />
    const catMatch = block.match(/<category\s+term="([^"]+)"/);
    const category = catMatch ? catMatch[1] : null;

    // <published>...</published>
    const pubMatch = block.match(/<published>([^<]+)<\/published>/);
    const published = pubMatch ? pubMatch[1].trim() : null;

    // <updated>...</updated>
    const updMatch = block.match(/<updated>([^<]+)<\/updated>/);
    const updated = updMatch ? updMatch[1].trim() : null;

    // <content type="html">...</content> — double XML-encoded
    const contentMatch = block.match(
      /<content[^>]*>([\s\S]*?)<\/content>/
    );
    const rawContent = contentMatch ? contentMatch[1] : "";
    // Decode XML entities to get actual HTML
    const decodedHtml = decodeXmlEntities(rawContent);

    // <media:thumbnail url="..." />
    const thumbMatch = block.match(
      /<(?:media:)?thumbnail[^>]+url="([^"]+)"/
    );
    const thumbnail = thumbMatch ? decodeXmlEntities(thumbMatch[1]) : null;

    entries.push({
      id: rawId,
      title,
      author,
      link,
      category,
      published,
      updated,
      decodedHtml,
      thumbnail
    });
  }

  return entries;
}

// ──────────────────────────────────────────────
// HTTP layer with throttle + retry
// ──────────────────────────────────────────────

async function redditFetchRss(url) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = attempt * 5000;
      console.warn(
        `[redditClient] Retry ${attempt}/${MAX_RETRIES} for ${url} (waiting ${backoff}ms)`
      );
      await sleep(backoff);
    }

    lastRequestTime = Date.now();

    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (fetchErr) {
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[redditClient] Fetch error: ${fetchErr.message}. Retrying...`
        );
        continue;
      }
      throw fetchErr;
    }

    if (response.status === 429) {
      const retryAfter = parseInt(
        response.headers.get("retry-after") || "60",
        10
      );
      console.warn(
        `[redditClient] Rate limited. Retry-After: ${retryAfter}s (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
      );
      if (attempt < MAX_RETRIES) {
        await sleep(Math.min(retryAfter * 1000, 120000));
        continue;
      }
      const err = new Error(
        `Reddit rate limit exceeded after ${MAX_RETRIES + 1} attempts`
      );
      err.isRateLimit = true;
      throw err;
    }

    // Log remaining quota
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining !== null && parseFloat(remaining) < 20) {
      console.warn(`[redditClient] Rate limit remaining: ${remaining}`);
    }

    if (
      response.status === 403 ||
      response.status === 404 ||
      response.status === 451
    ) {
      console.warn(`[redditClient] ${response.status} on ${url} — skipping`);
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `Reddit request failed with status ${response.status}`
      );
    }

    return await response.text();
  }
}

// ──────────────────────────────────────────────
// Normalize RSS entry → standard post object
// ──────────────────────────────────────────────

function normalizeRssEntry(entry) {
  if (!entry || !entry.id) return null;

  // Post ID: "t3_abc123" → "abc123"
  const postId = entry.id.replace(/^t3_/, "");
  if (!postId) return null;

  // Author: "/u/username" → "username"
  const author = entry.author
    ? entry.author.replace(/^\/u\//, "")
    : null;

  // Skip bot/deleted authors
  if (
    author === "[deleted]" ||
    author === "AutoModerator" ||
    (author && (author.endsWith("Bot") || author.endsWith("_bot")))
  ) {
    return null;
  }

  // Extract selftext from decoded HTML content
  const selftext = htmlToText(entry.decodedHtml);

  // Extract the post's target URL (from [link] href)
  const postUrl = extractPostUrl(entry.decodedHtml);

  // All external links
  const externalLinks = extractExternalLinks(entry.decodedHtml);

  // Permalink from entry link
  const permalink = entry.link
    ? entry.link.replace("https://www.reddit.com", "")
    : null;

  // Subreddit: try category first, then extract from permalink/content
  const subreddit =
    entry.category ||
    extractSubreddit(permalink, entry.decodedHtml);

  return {
    postId,
    title: entry.title || "",
    selftext,
    author,
    subreddit,
    permalink,
    url: postUrl,
    externalLinks,
    createdAt: entry.published || entry.updated || null,
    score: 0,
    upvoteRatio: null,
    numComments: 0,
    thumbnail: entry.thumbnail || null
  };
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Search Reddit for posts matching a query
 */
async function searchRedditPosts(query, subreddit = null) {
  const encodedQuery = encodeURIComponent(query);
  const limit = 25;

  const url = subreddit
    ? `${REDDIT_BASE}/r/${subreddit}/search/.rss?q=${encodedQuery}&restrict_sr=on&sort=new&limit=${limit}&t=month`
    : `${REDDIT_BASE}/search/.rss?q=${encodedQuery}&sort=new&limit=${limit}&t=month`;

  const xml = await redditFetchRss(url);
  if (!xml) return [];

  const entries = parseAtomFeed(xml);
  return entries.map(normalizeRssEntry).filter((p) => p !== null);
}

/**
 * Get recent posts from a subreddit
 */
async function getSubredditPosts(subreddit, limit = 25) {
  const url = `${REDDIT_BASE}/r/${subreddit}/new/.rss?limit=${Math.min(limit, 100)}`;

  const xml = await redditFetchRss(url);
  if (!xml) return [];

  const entries = parseAtomFeed(xml);
  return entries.map(normalizeRssEntry).filter((p) => p !== null);
}

/**
 * Get Reddit user profile info
 * Note: Reddit JSON API blocked on cloud IPs. Non-critical for discovery.
 */
async function getRedditUser(username) {
  return null;
}

module.exports = {
  searchRedditPosts,
  getRedditUser,
  getSubredditPosts
};
