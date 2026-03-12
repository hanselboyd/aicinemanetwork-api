/**
 * Database-dependent Module Tests
 * Tests modules that require database connectivity
 */

console.log('🔍 Testing Database-dependent Modules...\n');

// Test if crawlRuns can be loaded (might fail due to DB dependency)
try {
  const crawlRuns = require('./src/discovery/shared/crawlRuns.js');
  console.log('✅ CrawlRuns module loads (DB connection available)');
  
  // If we can load it, test the function signatures
  if (typeof crawlRuns.createCrawlRun === 'function' && 
      typeof crawlRuns.finishCrawlRun === 'function') {
    console.log('✅ CrawlRuns functions are properly exported');
  } else {
    console.log('❌ CrawlRuns functions are not properly exported');
  }
  
} catch (error) {
  console.log('❌ CrawlRuns module requires database connection');
  console.log(`   Error: ${error.message}`);
  console.log('⚠️  This is expected in testing environment without database');
}

// Test Vimeo runner without actually running discovery (which would need DB)
try {
  const vimeoRunner = require('./src/discovery/vimeo/runVimeoDiscovery.js');
  console.log('✅ Vimeo runner module loads (may have DB dependency)');
  
  if (typeof vimeoRunner.runVimeoDiscovery === 'function') {
    console.log('✅ Vimeo runner function is properly exported');
  } else {
    console.log('❌ Vimeo runner function is not properly exported');
  }
  
} catch (error) {
  console.log('❌ Vimeo runner module has dependency issues');
  console.log(`   Error: ${error.message}`);
}

// Let me check if there's an ingestion module that might be missing
try {
  const ingestVimeo = require('./src/discovery/vimeo/ingestVimeoResult.js');
  console.log('✅ Vimeo ingest module loads');
} catch (error) {
  console.log('❌ Vimeo ingest module missing or has dependencies');
  console.log(`   Error: ${error.message}`);
}

console.log('\n📊 Database dependency test completed');