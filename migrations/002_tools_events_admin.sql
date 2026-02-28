-- 002_tools_events_admin.sql

-- TOOLS
CREATE TABLE IF NOT EXISTS tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  tool_type text NOT NULL CHECK (tool_type = ANY (ARRAY['model','video','image','audio','editing','workflow','other'])),
  description text,
  website_url text,
  pricing_url text,
  tags text[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- EVENTS
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  location text,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  website_url text,
  organizer text,
  tags text[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CREATOR SUBMISSIONS (public intake)
CREATE TABLE IF NOT EXISTS creator_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  creator_type text NOT NULL CHECK (creator_type = ANY (ARRAY['individual','studio','collective'])),
  bio text,
  location text,
  website_url text,
  email text,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','approved','rejected'])),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ADMIN USERS
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS creators_tags_gin ON creators USING gin(tags);
CREATE INDEX IF NOT EXISTS tools_tags_gin ON tools USING gin(tags);
CREATE INDEX IF NOT EXISTS events_tags_gin ON events USING gin(tags);
CREATE INDEX IF NOT EXISTS creator_submissions_status_idx ON creator_submissions(status);
CREATE INDEX IF NOT EXISTS events_start_at_idx ON events(start_at);
