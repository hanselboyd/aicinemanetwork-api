function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(text) {
  const slug = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .trim();

  return slug;
}

function fallbackSlugSeed(text) {
  const raw = (text || "").trim();
  if (!raw) return "creator";

  const compact = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 12);

  if (!compact) return "creator";

  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }

  return `creator-${compact.toLowerCase()}-${String(hash).slice(0, 6)}`;
}

async function generateUniqueSlug(baseText, pool, excludeId = null) {
  const plainSlug = slugify(baseText);
  const baseSlug = plainSlug || fallbackSlugSeed(baseText);

  const exactQuery = excludeId
    ? `select id from creators where slug = $1 and id <> $2 limit 1`
    : `select id from creators where slug = $1 limit 1`;

  const exactParams = excludeId ? [baseSlug, excludeId] : [baseSlug];
  const exact = await pool.query(exactQuery, exactParams);

  if (!exact.rows.length) {
    return baseSlug;
  }

  for (let i = 2; i <= 1000; i += 1) {
    const candidate = `${baseSlug}-${i}`;

    const candidateQuery = excludeId
      ? `select id from creators where slug = $1 and id <> $2 limit 1`
      : `select id from creators where slug = $1 limit 1`;

    const candidateParams = excludeId ? [candidate, excludeId] : [candidate];
    const result = await pool.query(candidateQuery, candidateParams);

    if (!result.rows.length) {
      return candidate;
    }
  }

  return `${baseSlug}-${Date.now()}`;
}

module.exports = {
  normalizeName,
  slugify,
  fallbackSlugSeed,
  generateUniqueSlug
};
