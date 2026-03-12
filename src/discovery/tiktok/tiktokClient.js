// TikTok client stub - to be replaced with real API/scraping implementation

async function searchTikTokVideos(query) {
  console.log(`[tiktokClient] searchTikTokVideos called with query: ${query}`);
  return [];
}

async function getTikTokProfile(username) {
  console.log(`[tiktokClient] getTikTokProfile called with username: ${username}`);
  return null;
}

async function getTikTokUserVideos(username, limit = 10) {
  console.log(`[tiktokClient] getTikTokUserVideos called with username: ${username}, limit: ${limit}`);
  return [];
}

module.exports = {
  searchTikTokVideos,
  getTikTokProfile,
  getTikTokUserVideos
};
