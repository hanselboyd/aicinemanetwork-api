-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

----------------------------------------------------
-- CREATORS
----------------------------------------------------

CREATE TABLE IF NOT EXISTS creators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  creator_type TEXT NOT NULL CHECK (
    creator_type IN ('individual','studio','collective')
  ),
  bio TEXT,
  location TEXT,
  website_url TEXT,
  profile_image_url TEXT,
  social_links JSONB DEFAULT '{}'::jsonb,
  tags TEXT[] DEFAULT ARRAY[]::text[],
  verified BOOLEAN DEFAULT FALSE,
  featured BOOLEAN DEFAULT FALSE,
  published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

----------------------------------------------------
-- TOOLS
----------------------------------------------------

CREATE TABLE IF NOT EXISTS tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'video_generation',
      'image_generation',
      'animation',
      'audio',
      'editing',
      'pipeline',
      'distribution',
      'other'
    )
  ),
  pricing_model TEXT NOT NULL CHECK (
    pricing_model IN (
      'free',
      'freemium',
      'paid',
      'enterprise',
      'open_source'
    )
  ),
  description TEXT,
  website_url TEXT,
  logo_url TEXT,
  tags TEXT[] DEFAULT ARRAY[]::text[],
  featured BOOLEAN DEFAULT FALSE,
  published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

----------------------------------------------------
-- EVENTS
----------------------------------------------------

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'festival',
      'conference',
      'meetup',
      'screening',
      'deadline',
      'workshop',
      'online'
    )
  ),
  start_date DATE,
  end_date DATE,
  submission_deadline DATE,
  timezone TEXT,
  is_virtual BOOLEAN DEFAULT FALSE,
  location TEXT,
  description TEXT,
  website_url TEXT,
  tags TEXT[] DEFAULT ARRAY[]::text[],
  featured BOOLEAN DEFAULT FALSE,
  published BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

----------------------------------------------------
-- FILMS (Optional but powerful for linking to Front Door)
----------------------------------------------------

CREATE TABLE IF NOT EXISTS films (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  premiere_date DATE,
  watch_url TEXT,
  poster_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

----------------------------------------------------
-- RELATIONSHIPS
----------------------------------------------------

CREATE TABLE IF NOT EXISTS creator_tools (
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  tool_id UUID REFERENCES tools(id) ON DELETE CASCADE,
  PRIMARY KEY (creator_id, tool_id)
);

CREATE TABLE IF NOT EXISTS creator_events (
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  role TEXT,
  PRIMARY KEY (creator_id, event_id)
);

CREATE TABLE IF NOT EXISTS creator_films (
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  film_id UUID REFERENCES films(id) ON DELETE CASCADE,
  PRIMARY KEY (creator_id, film_id)
);

----------------------------------------------------
-- UPDATED_AT AUTO UPDATE TRIGGERS
----------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_creators_updated ON creators;
CREATE TRIGGER trg_creators_updated
BEFORE UPDATE ON creators
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_tools_updated ON tools;
CREATE TRIGGER trg_tools_updated
BEFORE UPDATE ON tools
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_events_updated ON events;
CREATE TRIGGER trg_events_updated
BEFORE UPDATE ON events
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

DROP TRIGGER IF EXISTS trg_films_updated ON films;
CREATE TRIGGER trg_films_updated
BEFORE UPDATE ON films
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

----------------------------------------------------
-- SEARCH INDEXES (FAST SEARCH)
----------------------------------------------------

CREATE INDEX IF NOT EXISTS creators_search_idx
ON creators USING GIN (
  to_tsvector('english', name || ' ' || coalesce(bio,''))
);

CREATE INDEX IF NOT EXISTS tools_search_idx
ON tools USING GIN (
  to_tsvector('english', name || ' ' || coalesce(description,''))
);

CREATE INDEX IF NOT EXISTS events_search_idx
ON events USING GIN (
  to_tsvector('english', name || ' ' || coalesce(description,''))
);

----------------------------------------------------
-- TAG INDEXES
----------------------------------------------------

CREATE INDEX IF NOT EXISTS creators_tags_gin
ON creators USING GIN (tags);

CREATE INDEX IF NOT EXISTS tools_tags_gin
ON tools USING GIN (tags);

CREATE INDEX IF NOT EXISTS events_tags_gin
ON events USING GIN (tags);

----------------------------------------------------
-- HELPFUL FILTER INDEXES
----------------------------------------------------

CREATE INDEX IF NOT EXISTS creators_pub_feat_idx
ON creators (published, featured);

CREATE INDEX IF NOT EXISTS tools_pub_feat_cat_idx
ON tools (published, featured, category);

CREATE INDEX IF NOT EXISTS events_date_idx
ON events (start_date, end_date, submission_deadline);