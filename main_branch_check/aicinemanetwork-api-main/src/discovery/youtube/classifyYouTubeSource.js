const {
  POSITIVE_TERMS,
  NEGATIVE_TERMS,
  BRAND_TOOL_TERMS
} = require("./keywords");

function countMatches(text, terms) {
  const lower = (text || "").toLowerCase();
  return terms.reduce((sum, term) => {
    return sum + (lower.includes(term) ? 1 : 0);
  }, 0);
}

function classifyYouTubeSource(source) {
  const title = source?.title || "";
  const description = source?.description || "";
  const channelTitle = source?.channelTitle || "";

  const combinedText = [title, description, channelTitle].join(" ").trim();

  const positiveMatches = countMatches(combinedText, POSITIVE_TERMS);
  const negativeMatches = countMatches(combinedText, NEGATIVE_TERMS);
  const brandChannelMatches = countMatches(channelTitle, BRAND_TOOL_TERMS);
  const brandTitleMatches = countMatches(title, BRAND_TOOL_TERMS);

  let score = 0;

  score += positiveMatches * 12;
  score -= negativeMatches * 10;

  if (title.toLowerCase().includes("ai short film")) score += 25;
  if (title.toLowerCase().includes("short film")) score += 15;
  if (title.toLowerCase().includes("official trailer")) score += 10;
  if (title.toLowerCase().includes("ai")) score += 10;

  if (/runway|pika|kling|midjourney|sora|veo/i.test(description)) score += 15;
  if (/director|filmmaker|official|cinematic|narrative/i.test(description)) score += 8;

  if (brandChannelMatches > 0) {
    score -= 40;
  }

  if (brandTitleMatches > 0 && brandChannelMatches > 0) {
    score -= 15;
  }

  if (
    brandChannelMatches > 0 &&
    !/director|filmmaker|studio|collective|official/i.test(description)
  ) {
    score -= 10;
  }

  let label = "false_positive";

  if (score >= 65) {
    label = "ai_filmmaker";
  } else if (score >= 45) {
    label = "mixed";
  } else if (score >= 30) {
    label = "possible_ai_film";
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    label
  };
}

module.exports = {
  classifyYouTubeSource
};
