-- 006_outreach_queue.sql

create table if not exists outreach_queue (
  id bigserial primary key,
  creator_id uuid not null references creators(id) on delete cascade,
  contact_type text not null,
  contact_value text not null,
  status text not null default 'pending', -- pending, sent, failed, skipped
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create unique index if not exists outreach_queue_unique_pending
  on outreach_queue(creator_id, contact_type, contact_value);

create index if not exists outreach_queue_status_idx
  on outreach_queue(status);

create index if not exists outreach_queue_creator_id_idx
  on outreach_queue(creator_id);
