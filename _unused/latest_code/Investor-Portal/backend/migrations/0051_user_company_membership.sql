CREATE TABLE IF NOT EXISTS user_company_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role varchar(50) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_company_membership_user_company_uidx
  ON user_company_membership (user_id, company_id);

INSERT INTO user_company_membership (user_id, company_id, role)
SELECT u.id, u.organization_id, u.role
FROM users u
WHERE u.organization_id IS NOT NULL
  AND u.role IN ('company_admin', 'company_user')
ON CONFLICT (user_id, company_id) DO UPDATE
SET role = EXCLUDED.role, updated_at = now();
