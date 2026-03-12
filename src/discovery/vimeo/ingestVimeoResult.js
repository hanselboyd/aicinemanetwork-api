const pool = require("../../db/pool");
const { classifyVimeoSource } = require("./classifyVimeoSource");
const { upsertCreatorFromVimeo } = require("./upsertCreatorFromVimeo");
const { enrichVimeoCreator } = require("./enrichVimeoCreator");
const { shouldAcceptVimeoSource } = require("./shouldAcceptVimeoSource");

function buildFinalClassification(baseClassification, creatorEnrichment) {
  let finalScore = baseClassification.score;
  let finalLabel = baseClassification.label;

  const averageScore = creatorEnrichment?.averageScore || 0;
  const strongCount = creatorEnrichment?.strongCount || 0;
  const videoCount = creatorEnrichment?.videos?.length || 0;

  // Boost for consistent creator
  if (strongCount >= 2) {
    finalScore += 12;
  }

  // Boost for high average
  if (averageScore >= 65) {
    finalScore += 8;
  } else if (averageScore < 45 && videoCount >= 3) {
    finalScore -= 8;
  }

  // Penalty for no strong content
  if (strongCount === 0 && videoCount >= 3) {
    finalScore -= 10;
  }

  finalScore = Math.max(0, Math.min(100, finalScore));

  // Re-label based on final score (Vimeo thresholds)
  if (finalScore >= 70) {
    finalLabel = "ai_filmmaker";
  } else if (finalScore >= 50) {
    finalLabel = "mixed";
  } else if (finalScore >= 35) {
    finalLabel = "possible_ai_film";
  } else {
    finalLabel = "false_positive";
  }

  return {
    score: finalScore,
    label: finalLabel
  };
}

async function ingestVimeoResult(item, query) {
  const baseClassification = classifyVimeoSource(item);
  const creatorEnrichment = await enrichVimeoCreator(item.creatorId);
  const classification = buildFinalClassification(
    baseClassification,
    creatorEnrichment
  );

  const decision = shouldAcceptVimeoSource({
    classification,
    creatorEnrichment
  });

  if (!decision.accept) {
    return false;
  }

  const { score, label } = classification;
  const sourceUrl = item.url;
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
      'vimeo',
      'video',
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      'crawler_vimeo_search',
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
      confidence_score = excluded.confidence_score,
      classifier_label = excluded.classifier_label,
      metadata = excluded.metadata,
      last_seen_at = now(),
      updated_at = now()
    returning *
    `,
    [
      sourceUrl,
      externalId || null,
      item.creatorHandle || null,
      item.title || null,
      item.description || null,
      item.thumbnailUrl || null,
      item.publishedAt || null,
      query || null,
      score,
      label,
      JSON.stringify({
        creatorId: item.creatorId || null,
        creatorTitle: item.creatorTitle || null,
        creatorAverageScore: creatorEnrichment.averageScore || 0,
        creatorStrongCount: creatorEnrichment.strongCount || 0,
        creatorVideoCount: creatorEnrichment.videos?.length || 0,
        baseScore: baseClassification.score,
        baseLabel: baseClassification.label,
        acceptReason: decision.reason
      })
    ]
  );

  const sourceRow = result.rows[0];

  await upsertCreatorFromVimeo(sourceRow, item, classification);

  return true;
}

module.exports = {
  ingestVimeoResult
};
