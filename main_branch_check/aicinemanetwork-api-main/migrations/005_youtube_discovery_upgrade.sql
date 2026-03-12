-- 005_youtube_discovery_upgrade.sql
-- YouTube crawler discovery upgrade

create table if not exists crawl_runs (
  id bigserial primary key,
  source_platform text not null,
  query text,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb
);

create table if not exists creator_sources (
  id bigserial primary key,
  creator_id uuid references creators(id) on delete set null,

  source_platform text not null,
  source_type text not null,
  source_url text not null,
  external_id text,
  handle text,
  title text,
  description text,
  thumbnail_url text,
  published_at timestamptz,
  discovered_from text,
  discovery_query text,
  confidence_score integer not null default 0,
  classifier_label text,
  contact_found boolean not null default false,
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists creator_sources_platform_external_uidx
  on creator_sources(source_platform, external_id)
  where external_id is not null;

create unique index if not exists creator_sources_platform_url_uidx
  on creator_sources(source_platform, source_url);

create index if not exists creator_sources_creator_id_idx
  on creator_sources(creator_id);

create index if not exists creator_sources_classifier_label_idx
  on creator_sources(classifier_label);

create index if not exists creator_sources_confidence_score_idx
  on creator_sources(confidence_score desc);

create table if not exists creator_contacts (
  id bigserial primary key,
  creator_id uuid not null references creators(id) on delete cascade,
  contact_type text not null,
  contact_value text not null,
  source_platform text,
  source_url text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists creator_contacts_unique
  on creator_contacts(creator_id, contact_type, contact_value);

alter table creators
  add column if not exists normalized_name text,
  add column if not exists primary_platform text,
  add column if not exists primary_source_url text,
  add column if not exists discovery_confidence integer not null default 0,
  add column if not exists classification text,
  add column if not exists last_discovered_at timestamptz,
  add column if not exists auto_claim_ready boolean not null default false;

create index if not exists creators_normalized_name_idx
  on creators(normalized_name);

create index if not exists creators_auto_claim_ready_idx
  on creators(auto_claim_ready);
