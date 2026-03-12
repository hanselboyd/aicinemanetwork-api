/**
 * Additional Edge Case Tests for Discovery System
 */

const { classifyVimeoSource } = require('./src/discovery/vimeo/classifyVimeoSource.js');
const { shouldAcceptVimeoSource } = require('./src/discovery/vimeo/shouldAcceptVimeoSource.js');
const { isBlockedCreatorName } = require('./src/discovery/shared/blockedCreatorNames.js');

console.log('🧪 Running Edge Case Tests...\n');

// Test edge cases for classifier
console.log('🎯 Testing Classifier Edge Cases:');

// Empty/null inputs
try {
  const emptyResult = classifyVimeoSource({});
  console.log('✅ Classifier handles empty input gracefully');
} catch (error) {
  console.log('❌ Classifier fails on empty input:', error.message);
}

try {
  const nullResult = classifyVimeoSource(null);
  console.log('✅ Classifier handles null input gracefully');
} catch (error) {
  console.log('❌ Classifier fails on null input:', error.message);
}

// Mixed signals content
const mixedContent = {
  title: 'AI Short Film Tutorial - How to Make Cinema with Runway',
  description: 'Tutorial on creating cinematic AI films using runway and midjourney tools',
  creatorTitle: 'Film Academy'
};

const mixedResult = classifyVimeoSource(mixedContent);
console.log(`✅ Mixed signals content scored: ${mixedResult.score} (label: ${mixedResult.label})`);

// Brand creator but artistic content
const brandArtistContent = {
  title: 'Experimental AI Cinema - Narrative Short',
  description: 'Original cinematic narrative created by our director using AI tools for storytelling',
  creatorTitle: 'Runway'
};

const brandArtistResult = classifyVimeoSource(brandArtistContent);
console.log(`✅ Brand creator with artistic content scored: ${brandArtistResult.score} (label: ${brandArtistResult.label})`);

// Test acceptance gate edge cases
console.log('\n🚪 Testing Acceptance Gate Edge Cases:');

// Border case scores
const borderCase1 = shouldAcceptVimeoSource({
  classification: { score: 50, label: 'possible_ai_film' },
  creatorEnrichment: { averageScore: 45, strongCount: 1, videos: [1] }
});
console.log(`✅ Border case score 50: ${borderCase1.accept ? 'ACCEPTED' : 'REJECTED'} (${borderCase1.reason})`);

const borderCase2 = shouldAcceptVimeoSource({
  classification: { score: 49, label: 'mixed' },
  creatorEnrichment: { averageScore: 60, strongCount: 2, videos: [1, 2] }
});
console.log(`✅ Border case score 49: ${borderCase2.accept ? 'ACCEPTED' : 'REJECTED'} (${borderCase2.reason})`);

// Test blocked names with variations
console.log('\n🚫 Testing Blocked Names Variations:');

const testNames = [
  'Runway',
  'RUNWAY',
  'runway',
  'OpenAI',
  'openai',
  'Independent Filmmaker',
  'Creative Studio',
  'Some Random Creator'
];

testNames.forEach(name => {
  const blocked = isBlockedCreatorName(name);
  console.log(`✅ "${name}": ${blocked ? 'BLOCKED' : 'ALLOWED'}`);
});

// Test classifier with various positive/negative combinations
console.log('\n📊 Testing Scoring Combinations:');

const testCases = [
  {
    name: 'Pure AI Filmmaker',
    source: {
      title: 'AI Short Film - Original Narrative',
      description: 'Independent director created this cinematic piece using AI tools',
      creatorTitle: 'Independent Filmmaker'
    }
  },
  {
    name: 'Tutorial Content',
    source: {
      title: 'How to Create AI Videos - Complete Guide',
      description: 'Tutorial explaining step by step process for beginners',
      creatorTitle: 'AI Tutorial Channel'
    }
  },
  {
    name: 'Music Video',
    source: {
      title: 'AI Music Video - Electronic Dreams',
      description: 'Music video created using AI generation tools for experimental sound',
      creatorTitle: 'Electronic Music Studio'
    }
  }
];

testCases.forEach(testCase => {
  const result = classifyVimeoSource(testCase.source);
  console.log(`✅ ${testCase.name}: Score ${result.score}, Label ${result.label}`);
});

console.log('\n🧪 Edge case testing completed successfully!');