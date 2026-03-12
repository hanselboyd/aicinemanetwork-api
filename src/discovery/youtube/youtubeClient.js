const API_BASE = "https://www.googleapis.com/youtube/v3";

function getApiKey() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing YOUTUBE_API_KEY environment variable");
  }
  return apiKey;
}

async function youtubeGet(path, params = {}) {
  const apiKey = getApiKey();

  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("key", apiKey);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error?.message ||
      `YouTube API request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function pickBestThumbnail(thumbnails) {
  if (!thumbnails) return null;
  return (
    thumbnails.maxres?.url ||
    thumbnails.standard?.url ||
    thumbnails.high?.url ||
    thumbnails.medium?.url ||
    thumbnails.default?.url ||
    null
  );
}

function normalizeSearchItem(item) {
  return {
    videoId: item?.id?.videoId || null,
    channelId: item?.snippet?.channelId || null,
    channelTitle: item?.snippet?.channelTitle || null,
    channelHandle: null,
    title: item?.snippet?.title || "",
    description: item?.snippet?.description || "",
    publishedAt: item?.snippet?.publishedAt || null,
    thumbnailUrl: pickBestThumbnail(item?.snippet?.thumbnails),
    url: item?.id?.videoId
      ? `https://www.youtube.com/watch?v=${item.id.videoId}`
      : null
  };
}

function normalizeVideoItem(item) {
  return {
    videoId: item?.id || null,
    channelId: item?.snippet?.channelId || null,
    channelTitle: item?.snippet?.channelTitle || null,
    channelHandle: null,
    title: item?.snippet?.title || "",
    description: item?.snippet?.description || "",
    publishedAt: item?.snippet?.publishedAt || null,
    thumbnailUrl: pickBestThumbnail(item?.snippet?.thumbnails),
    tags: item?.snippet?.tags || [],
    duration: item?.contentDetails?.duration || null,
    url: item?.id ? `https://www.youtube.com/watch?v=${item.id}` : null
  };
}

async function searchYouTubeVideos(query, options = {}) {
  const data = await youtubeGet("/search", {
    part: "snippet",
    q: query,
    type: "video",
    order: options.order || "date",
    maxResults: options.maxResults || 10,
    publishedAfter: options.publishedAfter || undefined
  });

  return (data.items || [])
    .map(normalizeSearchItem)
    .filter((item) => item.videoId && item.url);
}

async function getYouTubeChannelDetails(channelId) {
  const data = await youtubeGet("/channels", {
    part: "snippet,contentDetails,statistics",
    id: channelId,
    maxResults: 1
  });

  const item = data.items?.[0];
  if (!item) return null;

  return {
    channelId: item.id,
    title: item?.snippet?.title || "",
    description: item?.snippet?.description || "",
    publishedAt: item?.snippet?.publishedAt || null,
    customUrl: item?.snippet?.customUrl || null,
    thumbnailUrl: pickBestThumbnail(item?.snippet?.thumbnails),
    uploadsPlaylistId:
      item?.contentDetails?.relatedPlaylists?.uploads || null,
    subscriberCount: item?.statistics?.subscriberCount || null,
    videoCount: item?.statistics?.videoCount || null,
    viewCount: item?.statistics?.viewCount || null
  };
}

async function getVideosByIds(videoIds) {
  if (!videoIds.length) return [];

  const data = await youtubeGet("/videos", {
    part: "snippet,contentDetails",
    id: videoIds.join(","),
    maxResults: Math.min(videoIds.length, 50)
  });

  return (data.items || []).map(normalizeVideoItem);
}

async function getYouTubeChannelVideos(channelId, options = {}) {
  const channel = await getYouTubeChannelDetails(channelId);
  if (!channel?.uploadsPlaylistId) {
    return [];
  }

  const playlistData = await youtubeGet("/playlistItems", {
    part: "snippet",
    playlistId: channel.uploadsPlaylistId,
    maxResults: options.maxResults || 10
  });

  const videoIds = (playlistData.items || [])
    .map((item) => item?.snippet?.resourceId?.videoId)
    .filter(Boolean);

  const videos = await getVideosByIds(videoIds);

  return videos.map((video) => ({
    ...video,
    channelId: video.channelId || channel.channelId,
    channelTitle: video.channelTitle || channel.title
  }));
}

module.exports = {
  searchYouTubeVideos,
  getYouTubeChannelDetails,
  getYouTubeChannelVideos
};
