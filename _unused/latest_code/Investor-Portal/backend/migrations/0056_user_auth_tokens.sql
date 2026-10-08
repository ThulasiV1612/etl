-- DB-backed access and refresh tokens for portal authentication.
CREATE TABLE IF NOT EXISTS user_auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_type varchar(16) NOT NULL CHECK (token_type IN ('access', 'refresh')),
  token_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by_id uuid REFERENCES user_auth_tokens(id) ON DELETE SET NULL,
  portal_session_id uuid REFERENCES user_portal_sessions(id) ON DELETE SET NULL,
  user_agent text,
  client_ip varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS user_auth_tokens_hash_uidx
  ON user_auth_tokens (token_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS user_auth_tokens_user_type_active_idx
  ON user_auth_tokens (user_id, token_type)
  WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS user_auth_tokens_expires_idx
  ON user_auth_tokens (expires_at);
