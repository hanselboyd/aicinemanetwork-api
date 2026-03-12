function isBlockedEnrichmentDomain(url) {
  const lower = String(url || "").toLowerCase();

  const blockedDomains = [
    "runwayml.com",
    "substack.com",
    "substackcdn.com",
    "enable-javascript.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "youtube.com",
    "youtu.be",
    "discord.gg",
    "discord.com",
    "facebook.com",
    "fb.com",
    "tiktok.com",
    "reddit.com",
    "wikipedia.org",
    "amazon.com",
    "apple.com",
    "google.com",
    "microsoft.com"
  ];

  return blockedDomains.some((domain) => {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname === domain || hostname.endsWith(`.${domain}`);
    } catch {
      return lower.includes(domain);
    }
  });
}

function isUsefulWebsiteUrl(url) {
  const lower = String(url || "").toLowerCase();

  const badPatterns = [
    "/privacy",
    "/terms",
    "/pricing",
    "/api",
    "/docs",
    "/doc",
    "/changelog",
    "/status",
    "/academy",
    "/enterprise",
    "/news",
    "/customers",
    "/research",
    "/product",
    "/brand",
    "/educators",
    "/security",
    "/help",
    "/support",
    "/coc",
    "/careers",
    "/explore",
    "/characters",
    ".css",
    ".js",
    ".woff",
    ".woff2",
    ".otf",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".svg",
    "discord.gg",
    "substackcdn.com",
    "enable-javascript.com"
  ];

  const goodPatterns = [
    "/contact",
    "/about",
    "/bio",
    "/links",
    "/portfolio",
    "/studio",
    "/press",
    "linktr.ee",
    "beacons.ai",
    "solo.to",
    "carrd.co"
  ];

  if (goodPatterns.some((p) => lower.includes(p))) {
    return true;
  }

  if (badPatterns.some((p) => lower.includes(p))) {
    return false;
  }

  return false;
}

function isLikelyCreatorDomain(url) {
  const lower = String(url || "").toLowerCase();

  // Link hubs are almost always creator domains
  const linkHubDomains = [
    "linktr.ee",
    "beacons.ai",
    "solo.to",
    "carrd.co",
    "bio.link",
    "lnk.bio",
    "campsite.bio",
    "taplink.cc",
    "withkoji.com",
    "hoo.be"
  ];

  if (linkHubDomains.some((domain) => lower.includes(domain))) {
    return true;
  }

  // Portfolio platforms
  const portfolioPlatforms = [
    "behance.net",
    "dribbble.com",
    "artstation.com",
    "deviantart.com",
    "cargo.site",
    "cargocollective.com",
    "squarespace.com",
    "wix.com",
    "webflow.io",
    "format.com"
  ];

  if (portfolioPlatforms.some((domain) => lower.includes(domain))) {
    return true;
  }

  return false;
}

module.exports = {
  isBlockedEnrichmentDomain,
  isUsefulWebsiteUrl,
  isLikelyCreatorDomain
};
