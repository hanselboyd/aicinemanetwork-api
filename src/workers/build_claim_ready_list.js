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

async function getProjectCountsByCreator() {
  const hasProjects = await tableExists("projects");
  const hasCreatorProjects = await tableExists("creator_projects");

  if (!hasProjects || !hasCreatorProjects) {
    return new Map();
  }

  const res = await pool.query(
    `
    select
      cp.creator_id,
      count(distinct cp.project_id)::int as project_count,
      count(distinct case when coalesce(p.published, false) = true then cp.project_id end)::int as published_project_count
    from creator_projects cp
    join projects p on p.id = cp.project_id
    group by cp.creator_id
    `
  );

  return new Map(
    res.rows.map((row) => [
      row.creator_id,
      {
        projectCount: Number(row.project_count || 0),
        publishedProjectCount: Number(row.published_project_count || 0)
      }
    ])
  );
}

async function getContactSummaryByCreator() {
  const res = await pool.query(
    `
    select
      creator_id,
      bool_or(contact_type = 'email') as has_email,
      bool_or(contact_type in ('website', 'instagram', 'x', 'tiktok', 'vimeo')) as has_external_contact,
      count(*)::int as contact_count
    from creator_contacts
    group by creator_id
    `
  );

  return new Map(
    res.rows.map((row) => [
      row.creator_id,
      {
        hasEmail: Boolean(row.has_email),
        hasExternalContact: Boolean(row.has_external_contact),
        contactCount: Number(row.contact_count || 0)
      }
    ])
  );
}

async function getExistingOutreachCreatorIds() {
  const exists = await tableExists("outreach_queue");
  if (!exists) return new Set();

  const res = await pool.query(
    `
    select distinct creator_id
    from outreach_queue
    where status in ('pending', 'sent')
    `
  );

  return new Set(res.rows.map((row) => row.creator_id));
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

function computeClaimReadiness(creator, projectStats, contactStats) {
  const score = Number(creator.discovery_confidence || 0);
  const classification = creator.classification || null;

  const projectCount = projectStats?.projectCount || 0;
  const publishedProjectCount = projectStats?.publishedProjectCount || 0;

  const hasEmail = Boolean(contactStats?.hasEmail);
  const hasExternalContact = Boolean(contactStats?.hasExternalContact);

  let readinessScore = 0;

  if (classification === "ai_filmmaker") readinessScore += 35;
  if (score >= 90) readinessScore += 30;
  else if (score >= 80) readinessScore += 24;
  else if (score >= 70) readinessScore += 18;
  else if (score >= 60) readinessScore += 10;

  if (projectCount >= 3) readinessScore += 20;
  else if (projectCount >= 1) readinessScore += 10;

  if (publishedProjectCount >= 1) readinessScore += 15;

  if (hasEmail) readinessScore += 20;
  else if (hasExternalContact) readinessScore += 10;

  const qualifiesForClaimReady =
    classification === "ai_filmmaker" &&
    score >= 70 &&
    (hasEmail || hasExternalContact);

  const qualifiesForPriorityOutreach =
    qualifiesForClaimReady &&
    (publishedProjectCount >= 1 || projectCount >= 1 || score >= 85);

  return {
    readinessScore,
    qualifiesForClaimReady,
    qualifiesForPriorityOutreach,
    hasEmail,
    hasExternalContact,
    projectCount,
    publishedProjectCount
  };
}

async function buildClaimReadyList() {
  const [projectCounts, contactSummary, existingOutreachIds, claimColumns] =
    await Promise.all([
      getProjectCountsByCreator(),
      getContactSummaryByCreator(),
      getExistingOutreachCreatorIds(),
      getClaimColumns()
    ]);

  const creatorsRes = await pool.query(
    `
    select
      id,
      name,
      slug,
      discovery_confidence,
      classification,
      auto_claim_ready
    from creators
    where primary_platform is not null
    order by coalesce(discovery_confidence, 0) desc, last_discovered_at desc nulls last
    `
  );

  const hasClaimStatus = claimColumns.has("claim_status");
  const hasClaimedAt = claimColumns.has("claimed_at");

  let reviewed = 0;
  let claimReady = 0;
  let priorityOutreach = 0;
  let alreadyQueued = 0;
  let alreadyClaimed = 0;

  const claimReadyRows = [];

  for (const creator of creatorsRes.rows) {
    reviewed += 1;

    if (hasClaimStatus) {
      const claimStatusRes = await pool.query(
        `select claim_status from creators where id = $1 limit 1`,
        [creator.id]
      );
      const claimStatus = claimStatusRes.rows[0]?.claim_status;
      if (claimStatus === "claimed") {
        alreadyClaimed += 1;
        continue;
      }
    } else if (hasClaimedAt) {
      const claimedAtRes = await pool.query(
        `select claimed_at from creators where id = $1 limit 1`,
        [creator.id]
      );
      if (claimedAtRes.rows[0]?.claimed_at) {
        alreadyClaimed += 1;
        continue;
      }
    }

    const projectStats = projectCounts.get(creator.id);
    const contactStats = contactSummary.get(creator.id);

    const readiness = computeClaimReadiness(
      creator,
      projectStats,
      contactStats
    );

    if (!readiness.qualifiesForClaimReady) {
      continue;
    }

    claimReady += 1;

    if (existingOutreachIds.has(creator.id)) {
      alreadyQueued += 1;
    }

    if (readiness.qualifiesForPriorityOutreach) {
      priorityOutreach += 1;
    }

    claimReadyRows.push({
      creator_id: creator.id,
      name: creator.name,
      slug: creator.slug,
      discovery_confidence: Number(creator.discovery_confidence || 0),
      classification: creator.classification,
      readiness_score: readiness.readinessScore,
      has_email: readiness.hasEmail,
      has_external_contact: readiness.hasExternalContact,
      project_count: readiness.projectCount,
      published_project_count: readiness.publishedProjectCount,
      already_queued: existingOutreachIds.has(creator.id),
      priority_outreach: readiness.qualifiesForPriorityOutreach
    });
  }

  claimReadyRows.sort((a, b) => {
    return (
      b.priority_outreach - a.priority_outreach ||
      b.readiness_score - a.readiness_score ||
      b.discovery_confidence - a.discovery_confidence
    );
  });

  return {
    reviewed,
    claimReady,
    priorityOutreach,
    alreadyQueued,
    alreadyClaimed,
    rows: claimReadyRows
  };
}

if (require.main === module) {
  buildClaimReadyList()
    .then((result) => {
      console.log("Claim-ready list build complete:", {
        reviewed: result.reviewed,
        claimReady: result.claimReady,
        priorityOutreach: result.priorityOutreach,
        alreadyQueued: result.alreadyQueued,
        alreadyClaimed: result.alreadyClaimed
      });
      console.table(result.rows.slice(0, 25));
      process.exit(0);
    })
    .catch((error) => {
      console.error("Claim-ready list build failed:", error);
      process.exit(1);
    });
}

module.exports = {
  buildClaimReadyList
};
