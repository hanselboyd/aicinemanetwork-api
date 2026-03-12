const POSITIVE_TERMS = [
  "ai film",
  "ai filmmaker",
  "ai cinema",
  "generative film",
  "ai short film",
  "ai animation",
  "ai music video",
  "official selection",
  "award",
  "finalist",
  "winner"
];

const NEGATIVE_TERMS = [
  "news",
  "blog",
  "article",
  "press release",
  "advertisement",
  "sponsored"
];

const HIGH_QUALITY_DOMAINS = [
  "filmfreeway.com",
  "shortoftheweek.com",
  "vimeo.com/channels",
  "nowness.com",
  "directors-library.com"
];

function countMatches(text, terms) {
  const lower = (text || "").toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
}

function classifyWebSource(source) {
  const title = source?.title || "";
  const description = source?.description || "";
  const url = source?.url || "";
  const pageContent = source?.pageContent || "";

  const combinedText = [title, description, pageContent].join(" ").trim();

  const positiveMatches = countMatches(combinedText, POSITIVE_TERMS);
  const negativeMatches = countMatches(combinedText, NEGATIVE_TERMS);

  let score = 0;

  score += positiveMatches * 12;
  score -= negativeMatches * 8;

  // Festival/award signals
  if (/festival|award|competition|showcase/i.test(title)) score += 20;
  if (/official\s*selection|finalist|winner/i.test(combinedText)) score += 25;

  // Creator page signals
  if (/portfolio|filmmaker|director|about/i.test(url)) score += 15;

  // High-quality domain boost
  if (HIGH_QUALITY_DOMAINS.some(domain => url.toLowerCase().includes(domain))) {
    score += 20;
  }

  // Contact info presence
  if (source?.hasEmail) score += 10;
  if (source?.hasPortfolio) score += 10;

  let label = "false_positive";
  // Web sources can be high quality, moderate thresholds
  if (score >= 60) label = "ai_filmmaker";
  else if (score >= 40) label = "mixed";
  else if (score >= 25) label = "possible_ai_film";

  return {
    score: Math.max(0, Math.min(100, score)),
    label
  };
}

module.exports = {
  classifyWebSource
};
