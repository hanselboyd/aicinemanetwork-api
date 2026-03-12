const { BRAND_TOOL_TERMS } = require("../vimeo/keywords");

const POSITIVE_BIO_TERMS = [
  "filmmaker",
  "director",
  "ai film",
  "ai cinema",
  "short film",
  "music video",
  "creative director",
  "visual artist",
  "motion designer",
  "animator"
];

const NEGATIVE_BIO_TERMS = [
  "tutorial",
  "tips",
  "course",
  "learn",
  "prompt",
  "review",
  "news",
  "meme"
];

function countMatches(text, terms) {
  const lower = (text || "").toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
}

function classifyInstagramSource(source) {
  const bio = source?.bio || "";
  const username = source?.username || "";
  const fullName = source?.fullName || "";

  const combinedText = [bio, fullName].join(" ").trim();

  const positiveMatches = countMatches(combinedText, POSITIVE_BIO_TERMS);
  const negativeMatches = countMatches(combinedText, NEGATIVE_BIO_TERMS);
  const brandMatches = countMatches(username, BRAND_TOOL_TERMS);

  let score = 0;

  score += positiveMatches * 15;
  score -= negativeMatches * 12;

  // Strong signals in bio
  if (/filmmaker|director/i.test(bio)) score += 25;
  if (/ai\s*(film|cinema|short)/i.test(bio)) score += 20;
  if (/portfolio|showreel|reel/i.test(bio)) score += 10;

  // External link is strong signal
  if (source?.externalUrl) score += 15;
  if (source?.linkInBio) score += 10;

  // Brand account penalty
  if (brandMatches > 0) score -= 40;

  // Follower sanity check (if available)
  if (source?.followerCount && source.followerCount < 100) score -= 10;

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
  classifyInstagramSource
};
