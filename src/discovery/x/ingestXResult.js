const pool = require("../../db/pool");
const { classifyXSource } = require("./classifyXSource");
const { upsertCreatorFromX } = require("./upsertCreatorFromX");

async function ingestXResult(item, query) {
  const classification = classifyXSource(item);

  // X is signal-based, only create creators with strong self-identification
  const shouldCreate = classification.score >= 65 && classification.label === "ai_filmmaker";

  if (classification.score < 45) {
    return { accepted: false, reason: "score_too_low" };
  }

  const sourceUrl = item.tweetUrl || `https://x.com/${item.username}/status/${item.tweetId}`;
  const externalId = item.tweetId;

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
      'x',
      'post',
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      'crawler_x_search',
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
      item.text?.slice(0, 255) || null,
      item.text || null,
      item.createdAt || null,
      query || null,
      classification.score,
      classification.label,
      JSON.stringify({
        authorId: item.authorId || null,
        authorName: item.authorName || null,
        authorBio: item.authorBio || null,
        likeCount: item.likeCount || null,
        retweetCount: item.retweetCount || null,
        replyCount: item.replyCount || null,
        hasVideoLink: item.hasVideoLink || false,
        hasExternalLink: item.hasExternalLink || false,
        linkedUrls: item.linkedUrls || []
      })
    ]
  );

  const sourceRow = result.rows[0];

  if (shouldCreate) {
    await upsertCreatorFromX(sourceRow, item, classification);
  }

  return { accepted: true, creatorCreated: shouldCreate };
}

module.exports = {
  ingestXResult
};
