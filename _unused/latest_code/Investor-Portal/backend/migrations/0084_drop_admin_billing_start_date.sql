-- Drop platform-admin billing start date (hardcoded in saasBillingStartDate.ts).
ALTER TABLE "companies" DROP COLUMN IF EXISTS "saas_billing_starts_at";
DROP TABLE IF EXISTS "platform_settings";
