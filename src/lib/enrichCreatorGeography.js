const COUNTRY_LOOKUP = [
  [["united states", "usa", "u.s.", "new york", "los angeles", "atlanta", "miami", "chicago", "california", "texas"], { countryCode: "us", country: "United States" }],
  [["india", "mumbai", "delhi", "bangalore", "hyderabad", "chennai"], { countryCode: "in", country: "India" }],
  [["united kingdom", "uk", "england", "london", "manchester"], { countryCode: "gb", country: "United Kingdom" }],
  [["france", "paris"], { countryCode: "fr", country: "France" }],
  [["germany", "berlin", "munich"], { countryCode: "de", country: "Germany" }],
  [["brazil", "rio", "sao paulo"], { countryCode: "br", country: "Brazil" }],
  [["canada", "toronto", "vancouver", "montreal"], { countryCode: "ca", country: "Canada" }],
  [["australia", "sydney", "melbourne"], { countryCode: "au", country: "Australia" }],
  [["japan", "tokyo", "osaka"], { countryCode: "jp", country: "Japan" }],
  [["nigeria", "lagos", "abuja"], { countryCode: "ng", country: "Nigeria" }],
  [["south africa", "cape town", "johannesburg"], { countryCode: "za", country: "South Africa" }],
  [["singapore"], { countryCode: "sg", country: "Singapore" }],
  [["indonesia", "jakarta", "bali"], { countryCode: "id", country: "Indonesia" }],
  [["mexico", "mexico city", "guadalajara"], { countryCode: "mx", country: "Mexico" }],
  [["argentina", "buenos aires"], { countryCode: "ar", country: "Argentina" }],
  [["spain", "madrid", "barcelona"], { countryCode: "es", country: "Spain" }],
  [["italy", "rome", "milan"], { countryCode: "it", country: "Italy" }],
  [["sweden", "stockholm"], { countryCode: "se", country: "Sweden" }],
  [["netherlands", "amsterdam"], { countryCode: "nl", country: "Netherlands" }],
];

const COUNTRY_CENTROIDS = {
  us: { lat: 39.8283, lon: -98.5795 },
  in: { lat: 20.5937, lon: 78.9629 },
  gb: { lat: 55.3781, lon: -3.4360 },
  fr: { lat: 46.2276, lon: 2.2137 },
  de: { lat: 51.1657, lon: 10.4515 },
  br: { lat: -14.235, lon: -51.9253 },
  ca: { lat: 56.1304, lon: -106.3468 },
  au: { lat: -25.2744, lon: 133.7751 },
  jp: { lat: 36.2048, lon: 138.2529 },
  ng: { lat: 9.082, lon: 8.6753 },
  za: { lat: -30.5595, lon: 22.9375 },
  sg: { lat: 1.3521, lon: 103.8198 },
  id: { lat: -0.7893, lon: 113.9213 },
  mx: { lat: 23.6345, lon: -102.5528 },
  ar: { lat: -38.4161, lon: -63.6167 },
  es: { lat: 40.4637, lon: -3.7492 },
  it: { lat: 41.8719, lon: 12.5674 },
  se: { lat: 60.1282, lon: 18.6435 },
  nl: { lat: 52.1326, lon: 5.2913 },
};

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCountryCode(value) {
  const raw = cleanString(value).toLowerCase();
  if (!raw) return null;
  if (raw === "uk") return "gb";
  if (raw === "usa") return "us";
  return raw;
}

function buildTextBlob(creator) {
  return [
    creator?.name,
    creator?.bio,
    creator?.description,
    creator?.locationCity,
    creator?.country,
    creator?.location?.city,
    creator?.location?.country,
    creator?.headline,
    creator?.summary,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function inferFromText(text) {
  for (const [terms, result] of COUNTRY_LOOKUP) {
    if (terms.some((term) => text.includes(term))) return result;
  }
  return null;
}

function enrichCreatorGeography(creator) {
  const existingCountryCode =
    normalizeCountryCode(creator?.countryCode) ||
    normalizeCountryCode(creator?.location?.countryCode) ||
    normalizeCountryCode(creator?.enrichedCountryCode);

  const existingCountry =
    cleanString(creator?.country) ||
    cleanString(creator?.location?.country) ||
    cleanString(creator?.enrichedCountry);

  const lat = Number(creator?.lat ?? creator?.location?.lat);
  const lon = Number(creator?.lon ?? creator?.location?.lon);
  const hasExactLatLon = Number.isFinite(lat) && Number.isFinite(lon);

  if (existingCountryCode && hasExactLatLon) {
    return {
      countryCode: existingCountryCode,
      country: existingCountry || null,
      enrichedCountryCode: existingCountryCode,
      enrichedCountry: existingCountry || null,
      location: {
        ...(creator.location || {}),
        countryCode: existingCountryCode,
        country: existingCountry || null,
        lat,
        lon,
        source: "exact",
        precision: "city",
        confidence: 1,
      },
      geographyEnriched: true,
      geographyNeedsReview: false,
    };
  }

  if (existingCountryCode) {
    const centroid = COUNTRY_CENTROIDS[existingCountryCode] || null;
    return {
      countryCode: existingCountryCode,
      country: existingCountry || null,
      enrichedCountryCode: existingCountryCode,
      enrichedCountry: existingCountry || null,
      location: {
        ...(creator.location || {}),
        countryCode: existingCountryCode,
        country: existingCountry || null,
        lat: centroid?.lat ?? null,
        lon: centroid?.lon ?? null,
        source: "country_code",
        precision: "country",
        confidence: 0.9,
      },
      geographyEnriched: true,
      geographyNeedsReview: false,
    };
  }

  const inferred = inferFromText(buildTextBlob(creator));
  if (!inferred) {
    return {
      countryCode: null,
      country: null,
      enrichedCountryCode: null,
      enrichedCountry: null,
      location: creator.location || {},
      geographyEnriched: false,
      geographyNeedsReview: true,
    };
  }

  const centroid = COUNTRY_CENTROIDS[inferred.countryCode] || null;

  return {
    countryCode: inferred.countryCode,
    country: inferred.country,
    enrichedCountryCode: inferred.countryCode,
    enrichedCountry: inferred.country,
    location: {
      ...(creator.location || {}),
      countryCode: inferred.countryCode,
      country: inferred.country,
      lat: centroid?.lat ?? null,
      lon: centroid?.lon ?? null,
      source: "text_inference",
      precision: "country",
      confidence: 0.55,
    },
    geographyEnriched: true,
    geographyNeedsReview: true,
  };
}

module.exports = { enrichCreatorGeography };