const POSITIVE_TERMS = [
  "ai short film",
  "ai film",
  "made with runway",
  "made with midjourney",
  "made with sora",
  "my short film",
  "i made",
  "i created",
  "director",
  "filmmaker"
];

const NEGATIVE_TERMS = [
  "question",
  "help",
  "how do i",
  "tutorial",
  "prompt",
  "settings",
  "workflow",
  "meme",
  "discussion"
];

const STRONG_SUBREDDITS = [
  "runwayml",
  "aivideo",
  "shortfilm",
  "filmmakers"
];

function countMatches(text, terms) {
  const lower = (text || "").toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
}

function classifyRedditSource(source) {
  const title = source?.title || "";
  const selftext = source?.selftext || "";
  const subreddit = source?.subreddit || "";

  const combinedText = [title, selftext].join(" ").trim();

  const positiveMatches = countMatches(combinedText, POSITIVE_TERMS);
  const negativeMatches = countMatches(combinedText, NEGATIVE_TERMS);

  let score = 0;

  score += positiveMatches * 14;
  score -= negativeMatches * 12;

  // Strong signals
  if (/ai\s*short\s*film/i.test(title)) score += 25;
  if (/i\s*made|i\s*created|my\s*(new\s*)?(short\s*)?film/i.test(title)) score += 20;

  // Video link is strong signal
  if (source?.url && /youtube|vimeo|youtu\.be/i.test(source.url)) score += 20;

  // Subreddit quality boost
  if (STRONG_SUBREDDITS.includes(subreddit.toLowerCase())) score += 10;

  // Upvote ratio sanity
  if (source?.upvoteRatio && source.upvoteRatio > 0.8) score += 8;

  // Question/help post penalty
  if (/\?$/.test(title.trim())) score -= 15;
  if (/help|question|how\s*do/i.test(title)) score -= 15;

  let label = "false_positive";
  // Reddit is noisier, stricter thresholds
  if (score >= 70) label = "ai_filmmaker";
  else if (score >= 50) label = "mixed";
  else if (score >= 35) label = "possible_ai_film";

  return {
    score: Math.max(0, Math.min(100, score)),
    label
  };
}

module.exports = {
  classifyRedditSource
};
