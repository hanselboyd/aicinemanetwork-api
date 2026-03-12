const pool = require("../../db/pool");
const { classifyTikTokSource } = require("./classifyTikTokSource");
const { upsertCreatorFromTikTok } = require("./upsertCreatorFromTikTok");

async function ingestTikTokResult(item, query) {
  const classification = classifyTikTokSource(item);

  // TikTok is noisy - require high confidence for creator creation
  const shouldCreate = classification.score >= 70 && classification.label === "ai_filmmaker";

  if (classification.score < 50) {
    return { accepted: false, reason: "score_too_low" };
  }

  const sourceUrl = item.videoUrl || `https://tiktok.com/@${item.username}/video/${item.videoId}`;
  const externalId = item.videoId;

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
      published_at,
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
      'tiktok',
      'video',
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      'crawler_tiktok_search',
      $8,
      $9,
      $10,
      $11::jsonb,
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
      published_at = excluded.published_at,
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
      item.caption?.slice(0, 255) || null,
      item.caption || null,
      item.thumbnailUrl || null,
      item.createdAt || null,
      query || null,
      classification.score,
      classification.label,
      JSON.stringify({
        creatorId: item.creatorId || null,
        creatorBio: item.creatorBio || null,
        playCount: item.playCount || null,
        likeCount: item.likeCount || null,
        commentCount: item.commentCount || null,
        shareCount: item.shareCount || null
      })
    ]
  );

  const sourceRow = result.rows[0];

  if (shouldCreate) {
    await upsertCreatorFromTikTok(sourceRow, item, classification);
  }

  return { accepted: true, creatorCreated: shouldCreate };
}

module.exports = {
  ingestTikTokResult
};
