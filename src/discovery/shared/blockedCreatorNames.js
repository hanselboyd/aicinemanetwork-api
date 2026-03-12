const BLOCKED_CREATOR_NAMES = [
  "runway",
  "openai",
  "midjourney",
  "pika",
  "kling",
  "sora",
  "adobe",
  "canva",
  "stability ai",
  "luma",
  "veo",
  "google ai",
  "google deepmind",
  "anthropic",
  "meta ai",
  "nvidia",
  "microsoft",
  "amazon",
  "apple",
  "bytedance",
  "tencent",
  "alibaba"
];

function isBlockedCreatorName(name) {
  const lower = String(name || "").toLowerCase().trim();
  return BLOCKED_CREATOR_NAMES.includes(lower);
}

module.exports = {
  BLOCKED_CREATOR_NAMES,
  isBlockedCreatorName
};
