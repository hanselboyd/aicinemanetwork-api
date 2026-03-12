const pool = require("../../db/pool");
const { classifyWebSource } = require("./classifyWebSource");
const { extractContacts } = require("../shared/extractContacts");

async function ingestWebResult(item, query) {
  const classification = classifyWebSource(item);

  if (classification.score < 25) {
    return { accepted: false, reason: "score_too_low" };
  }

  const sourceUrl = item.url;
  const externalId = null; // Web pages don't have stable IDs

  // Extract contacts from page content
  const pageContacts = extractContacts(item.pageContent || "");

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
      'web',
      'page',
      $1,
      $2,
      $3,
      $4,
      $5,
      'crawler_web_search',
      $6,
      $7,
      $8,
      $9::jsonb,
      now(),
      now(),
      now()
    )
    on conflict (source_platform, source_url)
    do update set
      title = excluded.title,
      description = excluded.description,
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
      externalId,
      item.domain || null,
      item.title?.slice(0, 255) || null,
      item.description?.slice(0, 2000) || null,
      query || null,
      classification.score,
      classification.label,
      JSON.stringify({
        domain: item.domain || null,
        pageType: item.pageType || null,
        hasEmail: pageContacts.some(c => c.type === 'email'),
        hasPortfolio: item.hasPortfolio || false,
        extractedContacts: pageContacts,
        creatorMentions: item.creatorMentions || []
      })
    ]
  );

  // Web sources are high-quality validation but don't auto-create creators
  // They're used to validate/enrich existing creators
  return { 
    accepted: true, 
    creatorCreated: false,
    contactsFound: pageContacts.length
  };
}

module.exports = {
  ingestWebResult
};
