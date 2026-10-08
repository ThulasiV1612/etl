CREATE TABLE IF NOT EXISTS investment_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investment_id uuid NOT NULL REFERENCES deal_investment (id) ON DELETE CASCADE,
  investor_id text NOT NULL DEFAULT '',
  signature_request_id text NOT NULL,
  status text NOT NULL DEFAULT 'Sent',
  sign_url text,
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  completed_at timestamptz,
  dropbox_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS investment_signatures_signature_request_id_uidx
  ON investment_signatures (signature_request_id);

CREATE INDEX IF NOT EXISTS investment_signatures_investment_id_idx
  ON investment_signatures (investment_id);
