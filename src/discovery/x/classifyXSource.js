const { BRAND_TOOL_TERMS } = require("../vimeo/keywords");

const POSITIVE_TERMS = [
  "ai short film",
  "ai film",
  "filmmaker",
  "director",
  "released",
  "premiere",
  "trailer",
  "music video",
  "made with runway",
  "made with midjourney",
  "made with sora"
];

const NEGATIVE_TERMS = [
  "news",
  "breaking",
  "thread",
  "review",
  "opinion",
  "take",
  "ai slop",
  "retweet"
];

function countMatches(text, terms) {
  const lower = (text || "").toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
}

function classifyXSource(source) {
  const text = source?.text || "";
  const bio = source?.authorBio || "";
  const username = source?.username || "";

  const combinedText = [text, bio].join(" ").trim();

  const positiveMatches = countMatches(combinedText, POSITIVE_TERMS);
  const negativeMatches = countMatches(combinedText, NEGATIVE_TERMS);
  const brandMatches = countMatches(username, BRAND_TOOL_TERMS);

  let score = 0;

  score += positiveMatches * 12;
  score -= negativeMatches * 10;

  // Strong signals
  if (/filmmaker|director/i.test(bio)) score += 25;
  if (/ai\s*short\s*film/i.test(text)) score += 20;
  if (/release|premiere|watch/i.test(text)) score += 15;

  // Links are valuable signals
  if (source?.hasVideoLink) score += 15;
  if (source?.hasExternalLink) score += 10;

  // Self-identification
  if (/my\s*(new\s*)?(ai\s*)?(short\s*)?film/i.test(text)) score += 20;

  // Brand penalty
  if (brandMatches > 0) score -= 30;

  // News/commentary penalty
  if (/just\s*dropped|breaking|thread/i.test(text)) score -= 10;

  let label = "false_positive";
  if (score >= 65) label = "ai_filmmaker";
  else if (score >= 45) label = "mixed";
  else if (score >= 30) label = "possible_ai_film";

  return {
    score: Math.max(0, Math.min(100, score)),
    label
  };
}

module.exports = {
  classifyXSource
};
