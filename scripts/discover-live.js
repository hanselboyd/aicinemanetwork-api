#!/usr/bin/env node

/**
 * Discover Live Cron Script
 * 
 * Called by Render cron: npm run discover:live
 * Calls /api/admin/index-crawler/run to discover new AI films
 * from YouTube and Reddit.
 */

const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || `http://localhost:${process.env.PORT || 10000}`;
const CRON_SECRET = process.env.CRON_SECRET || 'ai-cinema-cron-2025';

async function run() {
  console.log(`[discover:live] Starting index crawler...`);

  try {
    const res = await fetch(`${BASE_URL}/api/admin/index-crawler/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': CRON_SECRET,
      },
      body: JSON.stringify({ source: 'all', limit: 30 }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[discover:live] API returned ${res.status}: ${text}`);
      process.exit(1);
    }

    const data = await res.json();
    console.log(`[discover:live] ✅ Complete!`);
    console.log(`[discover:live]   Discovered: ${data.total_discovered || 0}`);
    console.log(`[discover:live]   Films created: ${data.filmsCreated || 0}`);
    console.log(`[discover:live]   Creators created: ${data.creatorsCreated || 0}`);
  } catch (err) {
    console.error(`[discover:live] ❌ Error:`, err.message);
    process.exit(1);
  }
}

run();
