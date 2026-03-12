async function loadCreatorsNeedingEnrichment(limit = DEFAULT_LIMIT) {
  const sql = `
    SELECT
      id,
      name,
      website_url,
      social_links,
      email,
      claim_outreach_status
    FROM creators
    WHERE published = true
      AND (
        email IS NULL
        OR claim_outreach_status IS NULL
        OR claim_outreach_status IN ('not_ready', 'no_contact_found')
      )
    ORDER BY updated_at ASC NULLS FIRST, created_at ASC
    LIMIT $1
  `;

  const { rows } = await pool.query(sql, [limit]);
  return rows;
}
