# AI Cinema Network - Multi-Platform Discovery Crawler

## Original Problem Statement
Expand the YouTube-based AI filmmaker discovery crawler to support multiple platforms: Vimeo, Instagram, TikTok, X, Reddit, and Web/Festival pages. Each platform follows the same modular pattern for discovery, classification, enrichment, and creator upsert.

## Architecture

### Core Flow (All Platforms)
```
search/discovery query → normalize raw result → classify result → 
enrich source/profile → decide accept/reject → insert creator_sources → 
upsert creators → save contacts → reclassify maintenance
```

### Directory Structure
```
src/
  discovery/
    shared/
      crawlRuns.js           # Crawl run tracking
      extractContacts.js     # Contact extraction
      entityUtils.js         # Slug/name normalization
      blockedCreatorNames.js # Company blocklist
      contactEnrichmentRules.js # URL validation
    youtube/                 # Original YouTube pipeline
    vimeo/                   # NEW: Vimeo discovery
    instagram/               # NEW: Instagram discovery
    tiktok/                  # NEW: TikTok discovery
    x/                       # NEW: X (Twitter) discovery
    reddit/                  # NEW: Reddit discovery
    web/                     # NEW: Web/Festival discovery
  workers/
    discover_youtube.js
    discover_vimeo.js        # NEW
    discover_instagram.js    # NEW
    discover_tiktok.js       # NEW
    discover_x.js            # NEW
    discover_reddit.js       # NEW
    discover_web.js          # NEW
    reclassify_*_creators.js # Maintenance workers
```

## What's Been Implemented (Jan 2026)

### Phase 1: Vimeo (COMPLETE)
- [x] queries.js - 6 discovery queries
- [x] keywords.js - positive/negative/brand terms
- [x] vimeoClient.js - API client (stub)
- [x] classifyVimeoSource.js - Stricter thresholds than YouTube
- [x] enrichVimeoCreator.js - Creator video analysis
- [x] shouldAcceptVimeoSource.js - Acceptance gate
- [x] ingestVimeoResult.js - Full ingestion pipeline
- [x] upsertCreatorFromVimeo.js - Creator upsert logic
- [x] runVimeoDiscovery.js - Discovery runner
- [x] Worker: discover_vimeo.js
- [x] Worker: reclassify_vimeo_creators.js

### Phase 2: Shared Code Cleanup (COMPLETE)
- [x] entityUtils.js - Centralized slug/name helpers
- [x] blockedCreatorNames.js - Shared company blocklist
- [x] contactEnrichmentRules.js - URL validation helpers

### Phase 3: Instagram (COMPLETE - Stubs)
- [x] Profile-first enrichment approach
- [x] High-confidence creator creation only (65+)
- [x] Focus on contact/bio links extraction

### Phase 4: TikTok (COMPLETE - Stubs)
- [x] Strict thresholds due to noise (70+ for creation)
- [x] Noise penalties for viral/fyp content
- [x] Used for validation/emerging signal

### Phase 5: X (COMPLETE - Stubs)
- [x] Signal-based discovery
- [x] Self-identification detection
- [x] Link extraction from posts

### Phase 6: Reddit (COMPLETE - Stubs)
- [x] Project discovery focus
- [x] No auto-creator creation
- [x] Video link detection

### Phase 7: Web/Festival (COMPLETE - Stubs)
- [x] High-quality validation layer
- [x] Festival/award signal detection
- [x] Contact extraction

## npm Scripts
```bash
npm run discover:youtube    # YouTube discovery
npm run discover:vimeo      # Vimeo discovery
npm run discover:instagram  # Instagram discovery
npm run discover:tiktok     # TikTok discovery
npm run discover:x          # X discovery
npm run discover:reddit     # Reddit discovery
npm run discover:web        # Web/Festival discovery
npm run reclassify:youtube  # YouTube reclassification
npm run reclassify:vimeo    # Vimeo reclassification
npm run reclassify:instagram# Instagram reclassification
npm run reclassify:tiktok   # TikTok reclassification
```

### Phase 8: Outreach Queue System (COMPLETE)
- [x] Migration: 006_outreach_queue.sql
- [x] Migration: 007_creator_consolidation_fields.sql
- [x] Worker: build_outreach_queue.js - Queues high-confidence creators
- [x] Worker: consolidate_creator_sources.js - Cross-platform consolidation
- [x] Worker: build_claim_ready_list.js - Operational outreach report
- [x] Worker: find_duplicate_creators.js - Duplicate detection

## npm Scripts (Complete List)
```bash
# Discovery
npm run discover:youtube
npm run discover:vimeo
npm run discover:instagram
npm run discover:tiktok
npm run discover:x
npm run discover:reddit
npm run discover:web

# Maintenance
npm run reclassify:youtube
npm run reclassify:vimeo
npm run reclassify:instagram
npm run reclassify:tiktok
npm run enrich:contacts
npm run cleanup:contacts

# Outreach & Operations
npm run consolidate:sources
npm run build:outreach
npm run build:claimready
npm run find:duplicates
npm run claim:send
```

## Prioritized Backlog

### P0 - Critical (Next Steps)
- [ ] Replace Vimeo stub with real Vimeo API integration
- [ ] Set up PostgreSQL database and run migrations
- [ ] Test full discovery pipeline with real data

### P1 - High Priority
- [ ] Implement real Instagram API/scraping
- [ ] Implement real TikTok API/scraping
- [ ] Implement real X API integration
- [ ] Implement real Reddit API integration

### P2 - Medium Priority
- [ ] Web search integration (Google/Bing API)
- [ ] Email outreach automation
- [ ] Admin review UI

### P3 - Future Enhancements
- [ ] Project/film discovery layer
- [ ] Festival calendar integration
- [ ] Discovery health reporting

## User Personas
1. **AI Filmmaker** - Independent creator making AI-powered short films
2. **AI Film Studio** - Production company using AI tools
3. **Platform Admin** - Managing discovery quality and outreach

## Core Requirements (Static)
- Each platform module must be independent and modular
- All classifiers must penalize brand/tool accounts
- Acceptance gates must be stricter for noisier platforms
- Contact enrichment must validate URLs before saving
- Auto-claim-ready requires score >= 70 + contact info

## Technical Notes
- Database: PostgreSQL with existing migrations
- Backend: Node.js/Express
- All API clients currently return stubs (empty arrays)
- Ready for real API integration per platform
