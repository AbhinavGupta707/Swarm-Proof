CREATE TABLE IF NOT EXISTS swarmproof_audit_snapshots (
  id text PRIMARY KEY,
  share_token text UNIQUE,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS swarmproof_audit_snapshots_share_token_idx
  ON swarmproof_audit_snapshots (share_token)
  WHERE share_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS swarmproof_audit_snapshots_data_gin_idx
  ON swarmproof_audit_snapshots
  USING gin (data);
