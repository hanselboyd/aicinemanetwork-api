/**
 * Backend Test Suite for AI Filmmaker Discovery System
 * Tests all discovery modules, utilities, and functionality
 */

const path = require('path');

class DiscoveryModuleTests {
  constructor() {
    this.testsRun = 0;
    this.testsPassed = 0;
    this.failures = [];
  }

  logTest(name, passed, error = null) {
    this.testsRun += 1;
    if (passed) {
      this.testsPassed += 1;
      console.log(`✅ ${name}`);
    } else {
      console.log(`❌ ${name}`);
      if (error) {
        console.log(`   Error: ${error.message}`);
        this.failures.push({ test: name, error: error.message });
      }
    }
  }

  async testModuleLoading(modulePath, moduleName) {
    try {
      const module = require(modulePath);
      this.logTest(`${moduleName} module loads without errors`, true);
      return module;
    } catch (error) {
      this.logTest(`${moduleName} module loads without errors`, false, error);
      return null;
    }
  }

  async testVimeoDiscoveryModule() {
    console.log('\n🔍 Testing Vimeo Discovery Module...');
    
    // Test module loading
    const queries = await this.testModuleLoading('./src/discovery/vimeo/queries.js', 'Vimeo queries');
    const keywords = await this.testModuleLoading('./src/discovery/vimeo/keywords.js', 'Vimeo keywords');
    const client = await this.testModuleLoading('./src/discovery/vimeo/vimeoClient.js', 'Vimeo client');
    const classifier = await this.testModuleLoading('./src/discovery/vimeo/classifyVimeoSource.js', 'Vimeo classifier');
    const acceptanceGate = await this.testModuleLoading('./src/discovery/vimeo/shouldAcceptVimeoSource.js', 'Vimeo acceptance gate');
    const runner = await this.testModuleLoading('./src/discovery/vimeo/runVimeoDiscovery.js', 'Vimeo runner');

    // Test queries structure
    if (queries) {
      try {
        const hasQueries = Array.isArray(queries.VIMEO_DISCOVERY_QUERIES) && queries.VIMEO_DISCOVERY_QUERIES.length > 0;
        this.logTest('Vimeo queries are properly defined', hasQueries);
      } catch (error) {
        this.logTest('Vimeo queries are properly defined', false, error);
      }
    }

    // Test keywords structure
    if (keywords) {
      try {
        const hasKeywords = Array.isArray(keywords.POSITIVE_TERMS) && 
                          Array.isArray(keywords.NEGATIVE_TERMS) && 
                          Array.isArray(keywords.BRAND_TOOL_TERMS);
        this.logTest('Vimeo keywords are properly structured', hasKeywords);
      } catch (error) {
        this.logTest('Vimeo keywords are properly structured', false, error);
      }
    }

    // Test client functions
    if (client) {
      try {
        const hasFunctions = typeof client.searchVimeoVideos === 'function' &&
                           typeof client.getVimeoCreatorDetails === 'function' &&
                           typeof client.getVimeoCreatorVideos === 'function';
        this.logTest('Vimeo client functions are defined', hasFunctions);
        
        // Test client stub functionality
        const result = await client.searchVimeoVideos('test query');
        const isStub = Array.isArray(result) && result.length === 0;
        this.logTest('Vimeo client returns stub data correctly', isStub);
      } catch (error) {
        this.logTest('Vimeo client functions work', false, error);
      }
    }

    return { queries, keywords, client, classifier, acceptanceGate, runner };
  }

  async testInstagramDiscoveryModule() {
    console.log('\n📸 Testing Instagram Discovery Module...');
    
    const client = await this.testModuleLoading('./src/discovery/instagram/instagramClient.js', 'Instagram client');
    const queries = await this.testModuleLoading('./src/discovery/instagram/queries.js', 'Instagram queries');
    const classifier = await this.testModuleLoading('./src/discovery/instagram/classifyInstagramSource.js', 'Instagram classifier');
    const runner = await this.testModuleLoading('./src/discovery/instagram/runInstagramDiscovery.js', 'Instagram runner');

    if (client) {
      try {
        const result = await client.searchInstagramProfiles('test query');
        const isStub = Array.isArray(result) && result.length === 0;
        this.logTest('Instagram client returns stub data correctly', isStub);
      } catch (error) {
        this.logTest('Instagram client stub works', false, error);
      }
    }

    return { client, queries, classifier, runner };
  }

  async testTikTokDiscoveryModule() {
    console.log('\n🎵 Testing TikTok Discovery Module...');
    
    const client = await this.testModuleLoading('./src/discovery/tiktok/tiktokClient.js', 'TikTok client');
    const queries = await this.testModuleLoading('./src/discovery/tiktok/queries.js', 'TikTok queries');
    const classifier = await this.testModuleLoading('./src/discovery/tiktok/classifyTikTokSource.js', 'TikTok classifier');
    const runner = await this.testModuleLoading('./src/discovery/tiktok/runTikTokDiscovery.js', 'TikTok runner');

    if (client) {
      try {
        const result = await client.searchTikTokVideos('test query');
        const isStub = Array.isArray(result) && result.length === 0;
        this.logTest('TikTok client returns stub data correctly', isStub);
      } catch (error) {
        this.logTest('TikTok client stub works', false, error);
      }
    }

    return { client, queries, classifier, runner };
  }

  async testXDiscoveryModule() {
    console.log('\n🐦 Testing X (Twitter) Discovery Module...');
    
    const client = await this.testModuleLoading('./src/discovery/x/xClient.js', 'X client');
    const queries = await this.testModuleLoading('./src/discovery/x/queries.js', 'X queries');
    const classifier = await this.testModuleLoading('./src/discovery/x/classifyXSource.js', 'X classifier');
    const runner = await this.testModuleLoading('./src/discovery/x/runXDiscovery.js', 'X runner');

    if (client) {
      try {
        const result = await client.searchXPosts('test query');
        const isStub = Array.isArray(result) && result.length === 0;
        this.logTest('X client returns stub data correctly', isStub);
      } catch (error) {
        this.logTest('X client stub works', false, error);
      }
    }

    return { client, queries, classifier, runner };
  }

  async testRedditDiscoveryModule() {
    console.log('\n🔴 Testing Reddit Discovery Module...');
    
    const client = await this.testModuleLoading('./src/discovery/reddit/redditClient.js', 'Reddit client');
    const queries = await this.testModuleLoading('./src/discovery/reddit/queries.js', 'Reddit queries');
    const classifier = await this.testModuleLoading('./src/discovery/reddit/classifyRedditSource.js', 'Reddit classifier');
    const runner = await this.testModuleLoading('./src/discovery/reddit/runRedditDiscovery.js', 'Reddit runner');

    if (client) {
      try {
        const result = await client.searchRedditPosts('test query');
        const isStub = Array.isArray(result) && result.length === 0;
        this.logTest('Reddit client returns stub data correctly', isStub);
      } catch (error) {
        this.logTest('Reddit client stub works', false, error);
      }
    }

    return { client, queries, classifier, runner };
  }

  async testWebDiscoveryModule() {
    console.log('\n🌐 Testing Web Discovery Module...');
    
    const client = await this.testModuleLoading('./src/discovery/web/webSearchClient.js', 'Web search client');
    const queries = await this.testModuleLoading('./src/discovery/web/queries.js', 'Web queries');
    const classifier = await this.testModuleLoading('./src/discovery/web/classifyWebSource.js', 'Web classifier');
    const runner = await this.testModuleLoading('./src/discovery/web/runWebDiscovery.js', 'Web runner');

    if (client) {
      try {
        const result = await client.searchWebPages('test query');
        const isStub = Array.isArray(result) && result.length === 0;
        this.logTest('Web search client returns stub data correctly', isStub);
      } catch (error) {
        this.logTest('Web search client stub works', false, error);
      }
    }

    return { client, queries, classifier, runner };
  }

  async testSharedUtilities() {
    console.log('\n🛠️ Testing Shared Utilities...');
    
    const entityUtils = await this.testModuleLoading('./src/discovery/shared/entityUtils.js', 'Entity utilities');
    const blockedNames = await this.testModuleLoading('./src/discovery/shared/blockedCreatorNames.js', 'Blocked creator names');
    const contactRules = await this.testModuleLoading('./src/discovery/shared/contactEnrichmentRules.js', 'Contact enrichment rules');
    const extractContacts = await this.testModuleLoading('./src/discovery/shared/extractContacts.js', 'Extract contacts');

    // Test entity utils functionality
    if (entityUtils) {
      try {
        const normalized = entityUtils.normalizeName('Test Name 123!@#');
        const slugified = entityUtils.slugify('Test Name 123!@#');
        const seed = entityUtils.fallbackSlugSeed('Test Name');
        
        this.logTest('Entity utils normalize function works', typeof normalized === 'string');
        this.logTest('Entity utils slugify function works', typeof slugified === 'string');
        this.logTest('Entity utils fallback slug seed works', typeof seed === 'string');
      } catch (error) {
        this.logTest('Entity utils functions work', false, error);
      }
    }

    // Test blocked creator names
    if (blockedNames) {
      try {
        const isBlocked = blockedNames.isBlockedCreatorName('runway');
        const isNotBlocked = blockedNames.isBlockedCreatorName('independent filmmaker');
        
        this.logTest('Blocked creator names correctly identifies blocked names', isBlocked === true);
        this.logTest('Blocked creator names correctly identifies non-blocked names', isNotBlocked === false);
      } catch (error) {
        this.logTest('Blocked creator names function works', false, error);
      }
    }

    // Test contact enrichment rules
    if (contactRules) {
      try {
        const isBlocked = contactRules.isBlockedEnrichmentDomain('https://runwayml.com/test');
        const isUseful = contactRules.isUsefulWebsiteUrl('https://example.com/contact');
        const isCreator = contactRules.isLikelyCreatorDomain('https://linktr.ee/creator');
        
        this.logTest('Contact enrichment rules identify blocked domains', isBlocked === true);
        this.logTest('Contact enrichment rules identify useful URLs', isUseful === true);
        this.logTest('Contact enrichment rules identify creator domains', isCreator === true);
      } catch (error) {
        this.logTest('Contact enrichment rules work', false, error);
      }
    }

    // Test extract contacts
    if (extractContacts) {
      try {
        const contacts = extractContacts.extractContacts('Email: test@example.com Website: https://example.com');
        const hasEmail = contacts.some(c => c.type === 'email');
        const hasWebsite = contacts.some(c => c.type === 'website');
        
        this.logTest('Extract contacts finds email addresses', hasEmail);
        this.logTest('Extract contacts finds websites', hasWebsite);
      } catch (error) {
        this.logTest('Extract contacts function works', false, error);
      }
    }

    return { entityUtils, blockedNames, contactRules, extractContacts };
  }

  async testVimeoClassifierScoring() {
    console.log('\n🎯 Testing Vimeo Classifier Scoring Logic...');
    
    const classifier = await this.testModuleLoading('./src/discovery/vimeo/classifyVimeoSource.js', 'Vimeo classifier for scoring tests');
    
    if (classifier) {
      try {
        // Test high-score AI filmmaker content
        const aiFilmmakerSource = {
          title: 'AI Short Film - Experimental Cinema',
          description: 'Director created this cinematic narrative using runway and midjourney for AI filmmaking',
          creatorTitle: 'Independent Filmmaker Studio'
        };
        
        const highScoreResult = classifier.classifyVimeoSource(aiFilmmakerSource);
        this.logTest('Vimeo classifier scores AI filmmaker content highly', highScoreResult.score >= 70);
        this.logTest('Vimeo classifier labels AI filmmaker content correctly', highScoreResult.label === 'ai_filmmaker');

        // Test low-score tutorial content
        const tutorialSource = {
          title: 'How to use Runway - Tutorial Guide',
          description: 'Tutorial explainer on how to create AI videos step by step',
          creatorTitle: 'Runway'
        };
        
        const lowScoreResult = classifier.classifyVimeoSource(tutorialSource);
        this.logTest('Vimeo classifier scores tutorial content low', lowScoreResult.score < 50);
        this.logTest('Vimeo classifier rejects brand/tool content', lowScoreResult.label === 'false_positive');

        // Test brand content penalty
        const brandSource = {
          title: 'OpenAI Sora Demo Video',
          description: 'Official demo from OpenAI',
          creatorTitle: 'OpenAI'
        };
        
        const brandResult = classifier.classifyVimeoSource(brandSource);
        this.logTest('Vimeo classifier heavily penalizes brand content', brandResult.score < 30);

      } catch (error) {
        this.logTest('Vimeo classifier scoring logic works', false, error);
      }
    }
  }

  async testAcceptanceGates() {
    console.log('\n🚪 Testing Acceptance Gates...');
    
    const acceptanceGate = await this.testModuleLoading('./src/discovery/vimeo/shouldAcceptVimeoSource.js', 'Vimeo acceptance gate');
    
    if (acceptanceGate) {
      try {
        // Test high score acceptance
        const highScoreClassification = { score: 85, label: 'ai_filmmaker' };
        const highScoreEnrichment = { averageScore: 60, strongCount: 3, videos: [1, 2, 3] };
        
        const acceptResult = acceptanceGate.shouldAcceptVimeoSource({
          classification: highScoreClassification,
          creatorEnrichment: highScoreEnrichment
        });
        
        this.logTest('Acceptance gate accepts high-score content', acceptResult.accept === true);

        // Test low score rejection
        const lowScoreClassification = { score: 30, label: 'false_positive' };
        const lowScoreEnrichment = { averageScore: 30, strongCount: 0, videos: [] };
        
        const rejectResult = acceptanceGate.shouldAcceptVimeoSource({
          classification: lowScoreClassification,
          creatorEnrichment: lowScoreEnrichment
        });
        
        this.logTest('Acceptance gate rejects low-score content', rejectResult.accept === false);
        this.logTest('Acceptance gate provides rejection reason', typeof rejectResult.reason === 'string');

      } catch (error) {
        this.logTest('Acceptance gate logic works', false, error);
      }
    }
  }

  async testNpmScripts() {
    console.log('\n📦 Testing NPM Scripts...');
    
    const packageJson = await this.testModuleLoading('./package.json', 'Package.json');
    
    if (packageJson && packageJson.scripts) {
      const requiredScripts = [
        'discover:vimeo',
        'discover:instagram',
        'discover:tiktok',
        'discover:x',
        'discover:reddit',
        'discover:web'
      ];
      
      for (const script of requiredScripts) {
        const exists = packageJson.scripts.hasOwnProperty(script);
        this.logTest(`NPM script '${script}' is defined`, exists);
      }
    }
  }

  async runAllTests() {
    console.log('🚀 Starting AI Filmmaker Discovery System Backend Tests...\n');

    try {
      // Test all discovery modules
      await this.testVimeoDiscoveryModule();
      await this.testInstagramDiscoveryModule();
      await this.testTikTokDiscoveryModule();
      await this.testXDiscoveryModule();
      await this.testRedditDiscoveryModule();
      await this.testWebDiscoveryModule();

      // Test shared utilities
      await this.testSharedUtilities();

      // Test classifier scoring
      await this.testVimeoClassifierScoring();

      // Test acceptance gates
      await this.testAcceptanceGates();

      // Test npm scripts
      await this.testNpmScripts();

      // Print summary
      console.log('\n📊 Test Results Summary:');
      console.log(`✅ Tests Passed: ${this.testsPassed}`);
      console.log(`❌ Tests Failed: ${this.testsRun - this.testsPassed}`);
      console.log(`📈 Success Rate: ${((this.testsPassed / this.testsRun) * 100).toFixed(1)}%`);

      if (this.failures.length > 0) {
        console.log('\n❌ Failed Tests:');
        this.failures.forEach(failure => {
          console.log(`   - ${failure.test}: ${failure.error}`);
        });
      }

      return this.testsPassed === this.testsRun;

    } catch (error) {
      console.log(`\n💥 Test suite failed with error: ${error.message}`);
      return false;
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new DiscoveryModuleTests();
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = DiscoveryModuleTests;