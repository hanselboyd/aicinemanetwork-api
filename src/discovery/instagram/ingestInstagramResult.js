const pool = require("../../db/pool");
const { classifyInstagramSource } = require("./classifyInstagramSource");
const { upsertCreatorFromInstagram } = require("./upsertCreatorFromInstagram");

async function ingestInstagramResult(item, query) {
  const classification = classifyInstagramSource(item);

  // Instagram requires high confidence for new creator creation
  // Lower scores only enrich existing creators
  const shouldCreate = classification.score >= 65 && classification.label === "ai_filmmaker";

  if (!shouldCreate && classification.score < 45) {
    return { accepted: false, reason: "score_too_low" };
  }

  const sourceUrl = item.profileUrl || `https://instagram.com/${item.username}`;
  const externalId = item.userId || item.username;

  const result = await pool.query(
    `
    insert into creator_sources (
      source_platform,
      source_type,
      source_url,
      external_id,
      handle,
      title,
      description,
      thumbnail_url,
      discovered_from,
      discovery_query,
      confidence_score,
      classifier_label,
      metadata,
      last_seen_at,
      created_at,
      updated_at
    )
    values (
      'instagram',
      'profile',
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      'crawler_instagram_search',
      $7,
      $8,
      $9,
      $10::jsonb,
      now(),
      now(),
      now()
    )
    on conflict (source_platform, source_url)
    do update set
      external_id = excluded.external_id,
      handle = excluded.handle,
      title = excluded.title,
      description = excluded.description,
      thumbnail_url = excluded.thumbnail_url,
      discovery_query = excluded.discovery_query,
      confidence_score = greatest(creator_sources.confidence_score, excluded.confidence_score),
      classifier_label = excluded.classifier_label,
      metadata = excluded.metadata,
      last_seen_at = now(),
      updated_at = now()
    returning *
    `,
    [
      sourceUrl,
      externalId || null,
      item.username || null,
      item.fullName || null,
      item.bio || null,
      item.profilePicUrl || null,
      query || null,
      classification.score,
      classification.label,
      JSON.stringify({
        followerCount: item.followerCount || null,
        followingCount: item.followingCount || null,
        postCount: item.postCount || null,
        externalUrl: item.externalUrl || null,
        isVerified: item.isVerified || false
      })
    ]
  );

  const sourceRow = result.rows[0];

  // Only create new creators for high-confidence profiles
  if (shouldCreate) {
    await upsertCreatorFromInstagram(sourceRow, item, classification);
  }

  return { accepted: true, creatorCreated: shouldCreate };
}

module.exports = {
  ingestInstagramResult
};
