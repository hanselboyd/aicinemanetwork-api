const pool = require("../../db/pool");

async function createCrawlRun({ sourcePlatform, query }) {
  const result = await pool.query(
    `
    insert into crawl_runs (
      source_platform,
      query,
      status,
      started_at,
      stats
    )
    values ($1, $2, 'running', now(), '{}'::jsonb)
    returning *
    `,
    [sourcePlatform, query || null]
  );

  return result.rows[0];
}

async function finishCrawlRun(id, status, stats = {}) {
  const result = await pool.query(
    `
    update crawl_runs
    set
      status = $2,
      finished_at = now(),
      stats = $3::jsonb
    where id = $1
    returning *
    `,
    [id, status, JSON.stringify(stats || {})]
  );

  return result.rows[0];
}

module.exports = {
  createCrawlRun,
  finishCrawlRun
};
