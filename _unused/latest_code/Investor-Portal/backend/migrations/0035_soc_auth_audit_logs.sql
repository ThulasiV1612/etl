-- SOC / security audit: HTTP request rows (aligned with Drizzle socAuthAuditLogs schema).
CREATE TABLE IF NOT EXISTS soc_auth_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event varchar(512) NOT NULL,
  outcome varchar(32) NOT NULL,
  http_status integer NOT NULL,
  duration_ms integer NOT NULL,
  method varchar(16),
  path text,
  identifier text,
  client_ip varchar(128),
  requested_machine_ip varchar(128),
  request_url text,
  user_agent text,
  user_id varchar(36),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS soc_auth_audit_logs_created_at_idx ON soc_auth_audit_logs (created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS soc_auth_audit_logs_event_idx ON soc_auth_audit_logs (event);
