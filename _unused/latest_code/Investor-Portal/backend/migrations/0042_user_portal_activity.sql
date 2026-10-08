-- Portal user sessions (login/logout) and per-page navigation counts for metrics.
CREATE TABLE IF NOT EXISTS user_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS user_portal_sessions_user_login_idx
  ON user_portal_sessions (user_id, login_at DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_page_navigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES user_portal_sessions(id) ON DELETE CASCADE,
  page_path text NOT NULL,
  page_label varchar(255) NOT NULL DEFAULT '',
  visit_count integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS user_page_navigations_session_path_uidx
  ON user_page_navigations (session_id, page_path);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS user_page_navigations_user_idx
  ON user_page_navigations (user_id);
