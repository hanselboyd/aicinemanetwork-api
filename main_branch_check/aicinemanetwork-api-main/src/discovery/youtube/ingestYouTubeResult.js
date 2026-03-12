const pool = require("../../db/pool");
const { classifyYouTubeSource } = require("./classifyYouTubeSource");
const { upsertCreatorFromYouTube } = require("./upsertCreatorFromYouTube");
const { enrichYouTubeChannel } = require("./enrichYouTubeChannel");
const { shouldAcceptYouTubeSource } = require("./shouldAcceptYouTubeSource");

function buildFinalClassification(baseClassification, channelEnrichment) {
  let finalScore = baseClassification.score;
  let finalLabel = baseClassification.label;

  const averageScore = channelEnrichment?.averageScore || 0;
  const strongCount = channelEnrichment?.strongCount || 0;
  const videoCount = channelEnrichment?.videos?.length || 0;

  if (strongCount >= 2) {
    finalScore += 15;
  }

  if (averageScore >= 60) {
    finalScore += 10;
  } else if (averageScore < 40 && videoCount >= 3) {
    finalScore -= 10;
  }

  if (strongCount === 0 && videoCount >= 3) {
    finalScore -= 10;
  }

  finalScore = Math.max(0, Math.min(100, finalScore));

  if (finalScore >= 65) {
    finalLabel = "ai_filmmaker";
  } else if (finalScore >= 45) {
    finalLabel = "mixed";
  } else if (finalScore >= 30) {
    finalLabel = "possible_ai_film";
  } else {
    finalLabel = "false_positive";
  }

  return {
    score: finalScore,
    label: finalLabel
  };
}

async function ingestYouTubeResult(item, query) {
  const baseClassification = classifyYouTubeSource(item);
  const channelEnrichment = await enrichYouTubeChannel(item.channelId);
  const classification = buildFinalClassification(
    baseClassification,
    channelEnrichment
  );

  const decision = shouldAcceptYouTubeSource({
    classification,
    channelEnrichment
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
      'youtube',
      'video',
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      'crawler_youtube_search',
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
      item.channelHandle || null,
      item.title || null,
      item.description || null,
      item.thumbnailUrl || null,
      item.publishedAt || null,
      query || null,
      score,
      label,
      JSON.stringify({
        channelId: item.channelId || null,
        channelTitle: item.channelTitle || null,
        channelAverageScore: channelEnrichment.averageScore || 0,
        channelStrongCount: channelEnrichment.strongCount || 0,
        channelVideoCount: channelEnrichment.videos?.length || 0,
        baseScore: baseClassification.score,
        baseLabel: baseClassification.label,
        acceptReason: decision.reason
      })
    ]
  );

  const sourceRow = result.rows[0];

  await upsertCreatorFromYouTube(sourceRow, item, classification);

  return true;
}

module.exports = {
  ingestYouTubeResult
};
