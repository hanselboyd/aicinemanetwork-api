BEGIN;

ALTER TABLE creators
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS email_source_url TEXT,
ADD COLUMN IF NOT EXISTS email_confidence NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS email_type TEXT,
ADD COLUMN IF NOT EXISTS best_contact_url TEXT,
ADD COLUMN IF NOT EXISTS best_contact_method TEXT,
ADD COLUMN IF NOT EXISTS claim_outreach_ready BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS claim_outreach_status TEXT DEFAULT 'not_ready',
ADD COLUMN IF NOT EXISTS contact_discovered_at TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS creators_claim_outreach_status_idx
ON creators (claim_outreach_status);

CREATE INDEX IF NOT EXISTS creators_claim_outreach_ready_idx
ON creators (claim_outreach_ready);

CREATE INDEX IF NOT EXISTS creators_email_idx
ON creators (email);

COMMIT;
