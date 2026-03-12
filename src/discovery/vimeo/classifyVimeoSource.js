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

function classifyVimeoSource(source) {
  const title = source?.title || "";
  const description = source?.description || "";
  const creatorTitle = source?.creatorTitle || "";

  const combinedText = [title, description, creatorTitle].join(" ").trim();

  const positiveMatches = countMatches(combinedText, POSITIVE_TERMS);
  const negativeMatches = countMatches(combinedText, NEGATIVE_TERMS);
  const brandCreatorMatches = countMatches(creatorTitle, BRAND_TOOL_TERMS);
  const brandTitleMatches = countMatches(title, BRAND_TOOL_TERMS);

  let score = 0;

  // Positive boosts
  score += positiveMatches * 14;
  score -= negativeMatches * 12;

  // Strong title signals - Vimeo is more portfolio-driven so stricter
  if (title.toLowerCase().includes("ai short film")) score += 30;
  if (title.toLowerCase().includes("short film")) score += 18;
  if (title.toLowerCase().includes("music video")) score += 12;
  if (title.toLowerCase().includes("ai")) score += 12;

  // Description signals
  if (/runway|pika|kling|midjourney|sora|veo/i.test(description)) score += 18;
  if (/director|filmmaker|official|cinematic|narrative/i.test(description)) score += 10;
  if (/portfolio|reel|showreel/i.test(description)) score += 8;

  // Brand/tool penalty - reject official tool channels
  if (brandCreatorMatches > 0) {
    score -= 45;
  }

  if (brandTitleMatches > 0 && brandCreatorMatches > 0) {
    score -= 18;
  }

  if (
    brandCreatorMatches > 0 &&
    !/director|filmmaker|studio|collective|official/i.test(description)
  ) {
    score -= 12;
  }

  let label = "false_positive";

  // Vimeo thresholds are stricter than YouTube
  if (score >= 70) {
    label = "ai_filmmaker";
  } else if (score >= 50) {
    label = "mixed";
  } else if (score >= 35) {
    label = "possible_ai_film";
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    label
  };
}

module.exports = {
  classifyVimeoSource
};
