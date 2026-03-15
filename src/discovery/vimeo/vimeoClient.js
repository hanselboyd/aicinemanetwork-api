const VIMEO_API_BASE = "https://api.vimeo.com";

// Throttle: minimum ms between consecutive Vimeo API calls
const MIN_REQUEST_INTERVAL_MS = 1500;
const MAX_RETRIES = 2;

let lastRequestTime = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAccessToken() {
  const token = process.env.VIMEO_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Missing VIMEO_ACCESS_TOKEN environment variable");
  }
  return token;
}

async function vimeoGet(path, params = {}) {
  const token = getAccessToken();

  const url = new URL(`${VIMEO_API_BASE}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  // Throttle: ensure minimum gap between requests
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = attempt * 5000; // 5s, 10s
      console.warn(
        `[vimeoClient] Retry ${attempt}/${MAX_RETRIES} for ${path} (waiting ${backoff}ms)`
      );
      await sleep(backoff);
    }

    lastRequestTime = Date.now();

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      }
    });

    // Handle rate limiting with retry
    if (response.status === 429) {
      const retryAfter = parseInt(
        response.headers.get("retry-after") || "60",
        10
      );
      console.warn(
        `[vimeoClient] Rate limited on ${path}. Retry-After: ${retryAfter}s (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
      );
      if (attempt < MAX_RETRIES) {
        await sleep(retryAfter * 1000);
        continue;
      }
      // Final attempt also rate-limited — throw a specific error
      const err = new Error(
        `Vimeo rate limit exceeded after ${MAX_RETRIES + 1} attempts on ${path}`
      );
      err.isRateLimit = true;
      throw err;
    }

    // Log remaining quota when getting low
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining !== null && parseInt(remaining, 10) < 20) {
      console.warn(
        `[vimeoClient] Rate limit remaining: ${remaining} for ${path}`
      );
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        data?.error ||
        data?.error_description ||
        `Vimeo API request failed with status ${response.status}`;
      throw new Error(message);
    }

    return data;
  }
}

function pickBestPicture(pictures) {
  const sizes = pictures?.sizes || [];
  if (!sizes.length) return null;
  return sizes[sizes.length - 1]?.link || sizes[0]?.link || null;
}

function normalizeVideoItem(item) {
  const userUri = item?.user?.uri || "";
  const creatorId = userUri.split("/").pop() || null;

  return {
    videoId: item?.uri ? item.uri.split("/").pop() : null,
    creatorId,
    creatorTitle: item?.user?.name || "",
    creatorHandle: item?.user?.link || null,
    title: item?.name || "",
    description: item?.description || "",
    publishedAt: item?.created_time || null,
    thumbnailUrl: pickBestPicture(item?.pictures),
    duration: item?.duration || null,
    tags: Array.isArray(item?.tags) ? item.tags.map((t) => t?.name).filter(Boolean) : [],
    url: item?.link || null
  };
}

function normalizeUserItem(item) {
  return {
    creatorId: item?.uri ? item.uri.split("/").pop() : null,
    title: item?.name || "",
    description: item?.bio || "",
    location: item?.location_details?.formatted_address || null,
    websiteUrl: item?.website || null,
    profileUrl: item?.link || null,
    thumbnailUrl: pickBestPicture(item?.pictures)
  };
}

async function searchVimeoVideos(query, options = {}) {
  const data = await vimeoGet("/videos", {
    query,
    per_page: options.perPage || 10,
    sort: options.sort || "relevant",
    direction: "desc"
  });

  return (data?.data || [])
    .map(normalizeVideoItem)
    .filter((item) => item.videoId && item.url);
}

async function getVimeoCreatorDetails(creatorId) {
  if (!creatorId) return null;

  const data = await vimeoGet(`/users/${creatorId}`, {
    fields: [
      "uri",
      "name",
      "bio",
      "link",
      "website",
      "pictures",
      "location_details.formatted_address"
    ].join(",")
  });

  return normalizeUserItem(data);
}

async function getVimeoCreatorVideos(creatorId, options = {}) {
  if (!creatorId) return [];

  const data = await vimeoGet(`/users/${creatorId}/videos`, {
    per_page: options.perPage || 10,
    sort: options.sort || "date",
    direction: "desc"
  });

  return (data?.data || [])
    .map(normalizeVideoItem)
    .filter((item) => item.videoId && item.url);
}

module.exports = {
  searchVimeoVideos,
  getVimeoCreatorDetails,
  getVimeoCreatorVideos
};
