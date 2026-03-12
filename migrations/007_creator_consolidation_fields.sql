-- 007_creator_consolidation_fields.sql

-- Add consolidation fields to creators table
alter table creators
  add column if not exists source_count integer default 0,
  add column if not exists platform_count integer default 0,
  add column if not exists has_youtube boolean default false,
  add column if not exists has_vimeo boolean default false,
  add column if not exists has_instagram boolean default false,
  add column if not exists has_tiktok boolean default false,
  add column if not exists has_x boolean default false,
  add column if not exists has_website boolean default false,
  add column if not exists combined_discovery_score integer default 0,
  add column if not exists claim_priority integer default 3;

-- Add review status fields for admin layer
alter table creators
  add column if not exists review_status text default 'pending',
  add column if not exists review_notes text,
  add column if not exists reviewed_at timestamptz;

-- Add indexes for common queries
create index if not exists creators_claim_priority_idx
  on creators(claim_priority);

create index if not exists creators_combined_score_idx
  on creators(combined_discovery_score desc);

create index if not exists creators_review_status_idx
  on creators(review_status);

create index if not exists creators_platform_count_idx
  on creators(platform_count desc);
