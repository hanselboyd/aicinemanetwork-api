// Reddit source classifier
// Tuned for RSS-based discovery where selftext is minimal (just HTML preview).
// Primary signals: title terms, subreddit context, external video links.

const POSITIVE_TERMS = [
  "ai short film",
  "ai film",
  "ai movie",
  "ai cinema",
  "made with runway",
  "made with midjourney",
  "made with sora",
  "made with kling",
  "made with pika",
  "made with hailuo",
  "made with luma",
  "my short film",
  "my film",
  "i made",
  "i created",
  "i directed",
  "director",
  "filmmaker",
  "short film",
  "music video",
  "official mv",
  "official video",
  "film trailer",
  "mini film",
  "micro film"
];

const NEGATIVE_TERMS = [
  "question",
  "help",
  "how do i",
  "how to",
  "tutorial",
  "prompt",
  "settings",
  "workflow",
  "meme",
  "discussion",
  "looking for",
  "what is",
  "opinion",
  "thoughts on",
  "recommend",
  "comparison",
  "vs",
  "update",
  "changelog",
  "pricing",
  "subscription"
];

// Subreddits that are inherently about AI-generated content
const AI_NATIVE_SUBREDDITS = [
  "aivideo",
  "runwayml",
  "mediasynthesis",
  "klingaivideo"
];

// Broader film/art subreddits (less inherent AI context)
const FILM_SUBREDDITS = [
  "shortfilm",
  "filmmakers",
  "generative",
  "aiart",
  "stablediffusion",
  "midjourney"
];

function countMatches(text, terms) {
  const lower = (text || "").toLowerCase();
  return terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
}

function classifyRedditSource(source) {
  const title = source?.title || "";
  const selftext = source?.selftext || "";
  const subreddit = (source?.subreddit || "").toLowerCase();

  const combinedText = [title, selftext].join(" ").trim();

  const positiveMatches = countMatches(combinedText, POSITIVE_TERMS);
  const negativeMatches = countMatches(combinedText, NEGATIVE_TERMS);

  let score = 0;

  // Base term scoring
  score += positiveMatches * 14;
  score -= negativeMatches * 12;

  // Strong title signals
  if (/ai\s*short\s*film/i.test(title)) score += 25;
  if (/i\s*made|i\s*created|my\s*(new\s*)?(short\s*)?film/i.test(title))
    score += 20;

  // Creator content patterns in title (common in AI film posts)
  if (/\|\s*\w/.test(title)) score += 5; // "Title | Creator" format
  if (/\bep\s*\d|episode\s*\d|part\s*\d/i.test(title)) score += 10; // Series content
  if (/\(official\s*(mv|video|trailer)\)/i.test(title)) score += 10;
  if (/\btrailer\b/i.test(title)) score += 8;

  // External video link is strong signal
  if (source?.url && /youtube|vimeo|youtu\.be/i.test(source.url)) {
    score += 20;
  }

  // Subreddit context scoring
  if (AI_NATIVE_SUBREDDITS.includes(subreddit)) {
    // AI-native subs: content is inherently AI — give meaningful base
    score += 20;
  } else if (FILM_SUBREDDITS.includes(subreddit)) {
    // Film/art subs: relevant but need additional AI signals
    score += 10;
  }

  // Upvote ratio (when available from JSON API, not RSS)
  if (source?.upvoteRatio && source.upvoteRatio > 0.8) score += 8;

  // Question/help/discussion post penalties
  if (/\?$/.test(title.trim())) score -= 15;
  if (/help|question|how\s*do|how\s*to/i.test(title)) score -= 15;

  // Low-effort / non-creator content penalties
  if (/🤣|😂|lol|lmao|bruh/i.test(title)) score -= 10;
  if (title.length < 15) score -= 5; // Very short titles = likely low-effort

  let label = "false_positive";
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
