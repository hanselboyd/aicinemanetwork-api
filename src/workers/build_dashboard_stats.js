const pool = require("../db/pool");

async function tableExists(tableName) {
  const res = await pool.query(
    `
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = $1
    ) as exists
    `,
    [tableName]
  );

  return Boolean(res.rows[0]?.exists);
}

async function getClaimColumns() {
  const res = await pool.query(
    `
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'creators'
    `
  );

  return new Set(res.rows.map((row) => row.column_name));
}

async function countOne(sql) {
  const res = await pool.query(sql);
  return Number(res.rows[0]?.count || 0);
}

async function buildDashboardStats() {
  const [hasOutreachQueue, hasProjects, claimColumns] = await Promise.all([
    tableExists("outreach_queue"),
    tableExists("projects"),
    getClaimColumns()
  ]);

  const totalCreators = await countOne(
    `select count(*)::int as count from creators`
  );

  const totalSources = await countOne(
    `select count(*)::int as count from creator_sources`
  );

  const aiFilmmakers = await countOne(
    `select count(*)::int as count from creators where classification = 'ai_filmmaker'`
  );

  const claimReady = await countOne(
    `
    select count(*)::int as count
    from creators
    where classification = 'ai_filmmaker'
      and coalesce(discovery_confidence, 0) >= 70
      and auto_claim_ready = true
    `
  );

  let outreachQueueTotal = 0;
  let invited = 0;
  let emailSent = 0;

  if (hasOutreachQueue) {
    outreachQueueTotal = await countOne(
      `select count(*)::int as count from outreach_queue`
    );

    invited = await countOne(
      `
      select count(distinct creator_id)::int as count
      from outreach_queue
      where status in ('pending', 'sent')
      `
    );

    emailSent = await countOne(
      `
      select count(distinct creator_id)::int as count
      from outreach_queue
      where status = 'sent'
      `
    );
  }

  let claimed = 0;
  let unclaimed = totalCreators;

  if (claimColumns.has("claim_status")) {
    claimed = await countOne(
      `
      select count(*)::int as count
      from creators
      where claim_status = 'claimed'
      `
    );

    unclaimed = await countOne(
      `
      select count(*)::int as count
      from creators
      where coalesce(claim_status, 'unclaimed') <> 'claimed'
      `
    );
  } else if (claimColumns.has("claimed_at")) {
    claimed = await countOne(
      `
      select count(*)::int as count
      from creators
      where claimed_at is not null
      `
    );

    unclaimed = await countOne(
      `
      select count(*)::int as count
      from creators
      where claimed_at is null
      `
    );
  }

  let totalProjects = 0;
  let publishedProjects = 0;

  if (hasProjects) {
    totalProjects = await countOne(
      `select count(*)::int as count from projects`
    );

    const publishedColumnRes = await pool.query(
      `
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'projects'
          and column_name = 'published'
      ) as exists
      `
    );

    if (publishedColumnRes.rows[0]?.exists) {
      publishedProjects = await countOne(
        `
        select count(*)::int as count
        from projects
        where coalesce(published, false) = true
        `
      );
    }
  }

  return {
    totalCreators,
    totalSources,
    aiFilmmakers,
    claimReady,
    outreachQueueTotal,
    invited,
    emailSent,
    claimed,
    unclaimed,
    totalProjects,
    publishedProjects
  };
}

if (require.main === module) {
  buildDashboardStats()
    .then((stats) => {
      console.log("Dashboard stats:");
      console.table([stats]);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Dashboard stats build failed:", error);
      process.exit(1);
    });
}

module.exports = {
  buildDashboardStats
};
