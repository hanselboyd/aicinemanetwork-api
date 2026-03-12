// Reddit client stub - to be replaced with real API implementation

async function searchRedditPosts(query, subreddit = null) {
  console.log(`[redditClient] searchRedditPosts called with query: ${query}, subreddit: ${subreddit}`);
  return [];
}

async function getRedditUser(username) {
  console.log(`[redditClient] getRedditUser called with username: ${username}`);
  return null;
}

async function getSubredditPosts(subreddit, limit = 25) {
  console.log(`[redditClient] getSubredditPosts called with subreddit: ${subreddit}, limit: ${limit}`);
  return [];
}

module.exports = {
  searchRedditPosts,
  getRedditUser,
  getSubredditPosts
};
