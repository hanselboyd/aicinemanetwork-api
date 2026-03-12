const { BRAND_TOOL_TERMS } = require("../vimeo/keywords");

const POSITIVE_TERMS = [
  "ai short film",
  "ai film",
  "filmmaker",
  "director",
  "cinematic",
  "music video",
  "animation",
  "made with runway",
  "made with midjourney"
];

const NEGATIVE_TERMS = [
  "tutorial",
  "how to",
  "meme",
  "compilation",
  "repost",
  "viral",
  "fyp hack"
];

function countMatches(text, terms) {
  const lower = (text || "").toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
}

function classifyTikTokSource(source) {
  const caption = source?.caption || "";
  const bio = source?.creatorBio || "";
  const username = source?.username || "";

  const combinedText = [caption, bio].join(" ").trim();

  const positiveMatches = countMatches(combinedText, POSITIVE_TERMS);
  const negativeMatches = countMatches(combinedText, NEGATIVE_TERMS);
  const brandMatches = countMatches(username, BRAND_TOOL_TERMS);

  let score = 0;

  score += positiveMatches * 12;
  score -= negativeMatches * 15; // Higher penalty for noise

  // Strong signals
  if (/ai\s*short\s*film/i.test(caption)) score += 25;
  if (/filmmaker|director/i.test(bio)) score += 20;
  if (/runway|midjourney|pika|kling|sora/i.test(caption)) score += 15;

  // External link is valuable
  if (source?.creatorLink) score += 12;

  // Brand penalty
  if (brandMatches > 0) score -= 35;

  // TikTok-specific noise penalties
  if (/fyp|foryou|viral/i.test(caption)) score -= 8;
  if (/duet|stitch/i.test(caption)) score -= 5;

  let label = "false_positive";
  // TikTok thresholds are stricter due to noise
  if (score >= 70) label = "ai_filmmaker";
  else if (score >= 50) label = "mixed";
  else if (score >= 35) label = "possible_ai_film";

  return {
    score: Math.max(0, Math.min(100, score)),
    label
  };
}

module.exports = {
  classifyTikTokSource
};
