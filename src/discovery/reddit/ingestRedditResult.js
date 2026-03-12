const pool = require("../../db/pool");
const { classifyRedditSource } = require("./classifyRedditSource");
const { extractContacts } = require("../shared/extractContacts");

// Reddit focuses on project discovery, not immediate creator upsert
async function ingestRedditResult(item, query) {
  const classification = classifyRedditSource(item);

  if (classification.score < 35) {
    return { accepted: false, reason: "score_too_low" };
  }

  const sourceUrl = item.permalink 
    ? `https://reddit.com${item.permalink}` 
    : `https://reddit.com/r/${item.subreddit}/comments/${item.postId}`;
  const externalId = item.postId;

  // Extract any video/external links
  const linkedUrls = [];
  if (item.url && !/reddit\.com/i.test(item.url)) {
    linkedUrls.push(item.url);
  }

  const textContacts = extractContacts([item.title, item.selftext].join(" "));

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
      'reddit',
      'post',
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      'crawler_reddit_search',
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
      item.author || null,
      item.title?.slice(0, 255) || null,
      item.selftext?.slice(0, 2000) || null,
      item.createdAt || null,
      query || null,
      classification.score,
      classification.label,
      JSON.stringify({
        subreddit: item.subreddit || null,
        author: item.author || null,
        score: item.score || 0,
        upvoteRatio: item.upvoteRatio || null,
        numComments: item.numComments || 0,
        linkedUrl: item.url || null,
        linkedUrls: linkedUrls,
        extractedContacts: textContacts
      })
    ]
  );

  // Reddit doesn't auto-create creators - it's for discovery/signal
  // Creator upsert happens only when identity is strong AND repeated
  return { 
    accepted: true, 
    creatorCreated: false,
    hasVideoLink: linkedUrls.some(url => /youtube|vimeo|youtu\.be/i.test(url))
  };
}

module.exports = {
  ingestRedditResult
};
