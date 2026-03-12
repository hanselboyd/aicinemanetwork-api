const pool = require("../db/pool");

function tryRequire(path) {
  try {
    return require(path);
  } catch (error) {
    console.warn(`[DiscoverLive] Skipping ${path}: ${error.message}`);
    return null;
  }
}

async function countValue(sql) {
  const { rows } = await pool.query(sql);
  return Number(rows[0]?.count || 0);
}

async function getCountsBefore() {
  const [creators, sources, queue] = await Promise.all([
    countValue("select count(*)::int as count from creators"),
    countValue("select count(*)::int as count from creator_sources"),
    countValue("select count(*)::int as count from outreach_queue")
  ]);

  return { creators, sources, queue };
}

async function getCountsAfter() {
  return getCountsBefore();
}

function buildRunnerList() {
  const runners = [];

  const youtube = tryRequire("../discovery/youtube/runYoutubeDiscovery");
  if (youtube?.runYoutubeDiscovery) {
    runners.push({
      name: "youtube",
      run: youtube.runYoutubeDiscovery
    });
  }

  const vimeo = tryRequire("../discovery/vimeo/runVimeoDiscovery");
  if (vimeo?.runVimeoDiscovery) {
    runners.push({
      name: "vimeo",
      run: vimeo.runVimeoDiscovery
    });
  }

  const instagram = tryRequire("../discovery/instagram/runInstagramDiscovery");
  if (instagram?.runInstagramDiscovery) {
    runners.push({
      name: "instagram",
      run: instagram.runInstagramDiscovery
    });
  }

  const tiktok = tryRequire("../discovery/tiktok/runTikTokDiscovery");
  if (tiktok?.runTikTokDiscovery) {
    runners.push({
      name: "tiktok",
      run: tiktok.runTikTokDiscovery
    });
  }

  const x = tryRequire("../discovery/x/runXDiscovery");
  if (x?.runXDiscovery) {
    runners.push({
      name: "x",
      run: x.runXDiscovery
    });
  }

  const reddit = tryRequire("../discovery/reddit/runRedditDiscovery");
  if (reddit?.runRedditDiscovery) {
    runners.push({
      name: "reddit",
      run: reddit.runRedditDiscovery
    });
  }

  const web = tryRequire("../discovery/web/runWebDiscovery");
  if (web?.runWebDiscovery) {
    runners.push({
      name: "web",
      run: web.runWebDiscovery
    });
  }

  return runners;
}

async function runReclassifiers() {
  const jobs = [
    {
      name: "youtube",
      fn: tryRequire("./reclassify_youtube_creators")?.reclassifyYouTubeCreators
    },
    {
      name: "vimeo",
      fn: tryRequire("./reclassify_vimeo_creators")?.reclassifyVimeoCreators
    },
    {
      name: "instagram",
      fn: tryRequire("./reclassify_instagram_creators")?.reclassifyInstagramCreators
    },
    {
      name: "tiktok",
      fn: tryRequire("./reclassify_tiktok_creators")?.reclassifyTikTokCreators
    },
    {
      name: "x",
      fn: tryRequire("./reclassify_x_creators")?.reclassifyXCreators
    },
    {
      name: "reddit",
      fn: tryRequire("./reclassify_reddit_creators")?.reclassifyRedditCreators
    },
    {
      name: "web",
      fn: tryRequire("./reclassify_web_creators")?.reclassifyWebCreators
    }
  ];

  for (const job of jobs) {
    if (!job.fn) continue;

    try {
      const result = await job.fn();
      console.log(`[DiscoverLive] Reclassify ${job.name}:`, result);
    } catch (error) {
      console.error(`[DiscoverLive] Reclassify ${job.name} failed:`, error.message);
    }
  }
}

async function runContactEnrichment() {
  const enrichContactsModule = tryRequire("./enrich_creator_contacts");
  const cleanupContactsModule = tryRequire("./cleanup_enriched_contacts");
  const buildOutreachModule = tryRequire("./build_outreach_queue");

  if (enrichContactsModule?.enrichCreatorContacts) {
    try {
      const result = await enrichContactsModule.enrichCreatorContacts();
      console.log("[DiscoverLive] Contact enrichment:", result);
    } catch (error) {
      console.error("[DiscoverLive] Contact enrichment failed:", error.message);
    }
  }

  if (cleanupContactsModule?.cleanupEnrichedContacts) {
    try {
      const result = await cleanupContactsModule.cleanupEnrichedContacts();
      console.log("[DiscoverLive] Contact cleanup:", result);
    } catch (error) {
      console.error("[DiscoverLive] Contact cleanup failed:", error.message);
    }
  }

  if (buildOutreachModule?.buildOutreachQueue) {
    try {
      const result = await buildOutreachModule.buildOutreachQueue();
      console.log("[DiscoverLive] Outreach queue build:", result);
    } catch (error) {
      console.error("[DiscoverLive] Outreach queue build failed:", error.message);
    }
  }
}

async function run() {
  console.log("[DiscoverLive] Starting live creator discovery...");

  const before = await getCountsBefore();
  const runners = buildRunnerList();

  if (!runners.length) {
    throw new Error("No discovery runners found. Check platform run*Discovery exports.");
  }

  const platformResults = [];
  let failedPlatforms = 0;

  for (const runner of runners) {
    try {
      console.log(`[DiscoverLive] Running ${runner.name} discovery...`);
      const result = await runner.run();
      platformResults.push({
        platform: runner.name,
        ok: true,
        result: result || null
      });
      console.log(`[DiscoverLive] ${runner.name} complete:`, result);
    } catch (error) {
      failedPlatforms += 1;
      platformResults.push({
        platform: runner.name,
        ok: false,
        error: error.message
      });
      console.error(`[DiscoverLive] ${runner.name} failed:`, error.message);
    }
  }

  await runReclassifiers();
  await runContactEnrichment();

  const after = await getCountsAfter();

  const summary = {
    platforms_run: runners.length,
    platforms_failed: failedPlatforms,
    creators_before: before.creators,
    creators_after: after.creators,
    creators_added: Math.max(0, after.creators - before.creators),
    sources_before: before.sources,
    sources_after: after.sources,
    sources_added: Math.max(0, after.sources - before.sources),
    outreach_queue_before: before.queue,
    outreach_queue_after: after.queue,
    outreach_queue_added: Math.max(0, after.queue - before.queue),
    platform_results: platformResults
  };

  console.log("[DiscoverLive] Complete.");
  console.dir(summary, { depth: null });

  await pool.end();
}

if (require.main === module) {
  run().catch(async (err) => {
    console.error("[DiscoverLive] Fatal error:", err);
    try {
      await pool.end();
    } catch {}
    process.exit(1);
  });
}

module.exports = {
  run
};
