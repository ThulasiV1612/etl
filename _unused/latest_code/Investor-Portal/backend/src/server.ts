import "./env.bootstrap.js";

import express from "express";

import * as path from "node:path";

import { fileURLToPath } from "node:url";

import cors from "cors";

import cookieParser from "cookie-parser";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "./database/db.js";

import { assertJwtSecretConfigured } from "./config/auth.js";

import { applyCorsHeaders, corsOptions } from "./config/cors.js";

import { getUploadsPhysicalRoot } from "./config/uploadPaths.js";

import { postCompanySettingsBranding } from "./controllers/company/companySettingsBranding.controller.js";

import {

  postDeal,

  postDealOfferingDocumentUploads,

  postDealOfferingGalleryUploads,

  putDeal,

} from "./controllers/deal/add_deal.controller.js";

import {

  uploadDealCreateOrUpdateAssetImages,

  uploadDealOfferingGalleryFile,

} from "./middleware/dealAssetImageUpload.middleware.js";

import { uploadDealOfferingDocumentFiles } from "./middleware/dealOfferingDocumentUpload.middleware.js";

import { uploadDealEsignTemplateFiles } from "./middleware/dealEsignTemplateUpload.middleware.js";

import { uploadCompanySettingsBranding } from "./middleware/companySettingsBrandingUpload.middleware.js";

import { socHttpAuditMiddleware } from "./middleware/socHttpAudit.middleware.js";

import { protectedUploadsMiddleware } from "./middleware/protectedUploads.middleware.js";

import { signflowWebhookBodyParser } from "./middleware/signflowWebhook.middleware.js";

import { stripeWebhookBodyParser } from "./middleware/stripeWebhook.middleware.js";

// import {
//
//   authRateLimiter,
//
//   generalApiRateLimiter,
//
//   webhookRateLimiter,
//
// } from "./middleware/rateLimit.js";

import { securityHeadersMiddleware } from "./middleware/securityHeaders.js";

import { portalModeContextMiddleware } from "./middleware/portalMode.middleware.js";

import {

  errorHandler,

  notFoundHandler,

} from "./middleware/errorHandler.js";

import userRoutes from "./routes/userRoutes.routes.js";

import companyRoutes from "./routes/companyRoutes.routes.js";

import dealFormRoutes from "./routes/dealForm.routes.js";

import classSetupRoutes from "./routes/classSetup.routes.js";
import distributionSetupRoutes from "./routes/distributionSetup.routes.js";
import { postDealDistributionComplete } from "./controllers/distributionSetup/distributionSetup.controller.js";

import contactRoutes from "./routes/contact.routes.js";

import esignTemplateRoutes from "./routes/esignTemplate.routes.js";

import investingProfileBookRoutes from "./routes/investingProfileBook.routes.js";

import platformRoutes from "./routes/platformRoutes.routes.js";

import ghlRoutes from "./routes/ghl.routes.js";

import billingRoutes from "./routes/billing.routes.js";
import investorPaymentsRoutes from "./routes/investorPayments.routes.js";

import { postDropboxSignWebhook } from "./controllers/deal/dealDropboxSignWebhook.controller.js";

import { postSignFlowWebhook } from "./controllers/deal/dealSignflowWebhook.controller.js";

import { postStripeWebhook } from "./controllers/billing/stripeWebhook.controller.js";

import { postDealEsignTemplateUploads } from "./controllers/deal/dealEsignTemplates.controller.js";

import { dropboxSignWebhookUpload } from "./middleware/dropboxSignWebhook.middleware.js";

import investmentSignatureRoutes from "./routes/investmentSignature.routes.js";

import { getSignFlowPublicConfig } from "./config/signflow.config.js";

import { getGhlPublicConfig } from "./config/ghl.config.js";

import { getStripePublicConfig, resolveFrontendOrigin } from "./config/stripe.config.js";

import dealAssetsRoutes from "./routes/dealAssets.routes.js";


assertJwtSecretConfigured();



const PORT = process.env.BACKEND_PORT ?? 5004;

const app = express();



app.set("trust proxy", 1);

app.use(securityHeadersMiddleware());

app.use(cors(corsOptions()));

app.use(cookieParser());



app.use((req, res, next) => {

  applyCorsHeaders(req, res);

  next();

});



/* Webhooks — register before global JSON parser. */

app.post(

  "/webhooks/dropbox-sign",

  // webhookRateLimiter,

  dropboxSignWebhookUpload,

  postDropboxSignWebhook,

);

app.post(

  "/api/webhooks/dropbox-sign",

  // webhookRateLimiter,

  dropboxSignWebhookUpload,

  postDropboxSignWebhook,

);

app.post(

  "/webhooks/signflow",

  // webhookRateLimiter,

  signflowWebhookBodyParser,

  postSignFlowWebhook,

);

app.post(

  "/api/webhooks/signflow",

  // webhookRateLimiter,

  signflowWebhookBodyParser,

  postSignFlowWebhook,

);

app.post(

  "/webhooks/stripe",

  // webhookRateLimiter,

  stripeWebhookBodyParser,

  postStripeWebhook,

);

app.post(

  "/api/webhooks/stripe",

  // webhookRateLimiter,

  stripeWebhookBodyParser,

  postStripeWebhook,

);



/* Multipart uploads must run before any body parser (multer/busboy reads the stream). */

app.post(

  "/api/v1/companies/:companyId/settings/branding/:assetType",

  socHttpAuditMiddleware,

  uploadCompanySettingsBranding,

  postCompanySettingsBranding,

);

app.post(

  "/api/v1/deals",

  socHttpAuditMiddleware,

  uploadDealCreateOrUpdateAssetImages,

  postDeal,

);

app.put(

  "/api/v1/deals/:dealId",

  socHttpAuditMiddleware,

  uploadDealCreateOrUpdateAssetImages,

  putDeal,

);

app.post(

  "/api/v1/deals/:dealId/offering-gallery-uploads",

  socHttpAuditMiddleware,

  uploadDealOfferingGalleryFile,

  postDealOfferingGalleryUploads,

);

app.post(

  "/api/v1/deals/:dealId/offering-document-uploads",

  socHttpAuditMiddleware,

  uploadDealOfferingDocumentFiles,

  postDealOfferingDocumentUploads,

);

app.post(

  "/api/v1/deals/:dealId/esign-template-uploads",

  uploadDealEsignTemplateFiles,

  postDealEsignTemplateUploads,

);



app.use(express.json({ limit: "10mb" }));

app.use(express.urlencoded({ limit: "10mb", extended: true }));

/** Direct mount so Complete is reachable even if nested routers miss the path. */
app.post(
  "/api/v1/deals/:dealId/distribution-setup/complete",
  socHttpAuditMiddleware,
  postDealDistributionComplete,
);



// app.use("/api/v1/auth", authRateLimiter);

// app.use("/api/v1", generalApiRateLimiter);

app.use("/api/v1", socHttpAuditMiddleware);



app.use("/api/v1", (req, res, next) => {

  if (req.method === "OPTIONS") {

    return res.status(204).end();

  }

  next();

});

app.use("/api/v1", portalModeContextMiddleware);



const uploadsRoot = getUploadsPhysicalRoot();

app.use("/uploads", protectedUploadsMiddleware);

console.log("Protected /uploads →", uploadsRoot);



app.use("/api/v1", [

  userRoutes,

  companyRoutes,

  distributionSetupRoutes,

  classSetupRoutes,

  dealAssetsRoutes,

  dealFormRoutes,

  contactRoutes,

  esignTemplateRoutes,

  investingProfileBookRoutes,

  investmentSignatureRoutes,

  platformRoutes,

  ghlRoutes,

  billingRoutes,

  investorPaymentsRoutes,

]);



app.use(notFoundHandler);

app.use(errorHandler);



console.log("Starting server...");



const baseUrl = process.env.BASE_URL?.trim();

const signFlowCfg = getSignFlowPublicConfig();

if (signFlowCfg.configured) {

  console.log(

    `SignFlow configured (${signFlowCfg.testMode ? "sandbox" : "production"}) → ${signFlowCfg.baseUrl}`,

  );

  const webhookBase = baseUrl?.trim() || `http://localhost:${PORT}`;

  console.log(`SignFlow webhook URL → ${webhookBase}/api/webhooks/signflow`);

} else {

  console.log(

    "SignFlow not configured — set SIGNFLOW_API_BASE_URL and SIGNFLOW_API_KEY (see API_INTEGRATION.md).",

  );

}



const stripeCfg = getStripePublicConfig();

if (stripeCfg.configured) {
  const webhookBase = baseUrl?.trim() || `http://localhost:${PORT}`;
  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production" ||
    process.env.DEPLOY_ENV === "production";

  console.log(
    `Stripe billing configured (${stripeCfg.testMode ? "test" : "live"})`,
  );
  console.log(`Stripe webhook URL → ${webhookBase}/api/webhooks/stripe`);
  const seatPriceCount = stripeCfg.plans.reduce(
    (n, p) =>
      n +
      p.seats.filter((s) => s.monthlyPriceId || s.annualPriceId).length,
    0,
  );
  console.log(
    `Stripe seat prices loaded: ${seatPriceCount} plan×seat bands with at least one cycle`,
  );

  if (isProd && stripeCfg.testMode) {
    console.error(
      "FATAL RISK: production is using a Stripe TEST key (sk_test_). Use sk_live_ for real charges.",
    );
  }
  if (isProd && !stripeCfg.webhookConfigured) {
    console.error(
      "FATAL RISK: STRIPE_WEBHOOK_SECRET is unset in production — invoice/subscription sync will fail.",
    );
  }
  if (isProd && !resolveFrontendOrigin()) {
    console.error(
      "FATAL RISK: BASE_URL is unset — Stripe Checkout/Portal redirects will fail.",
    );
  }
  const missingPlanPrices = stripeCfg.plans.filter(
    (p) => !p.monthlyPriceId && !p.annualPriceId,
  );
  if (isProd && missingPlanPrices.length > 0) {
    console.error(
      `FATAL RISK: Stripe Price IDs missing for: ${missingPlanPrices
        .map((p) => `${p.id} (${p.monthlyEnv}/${p.annualEnv})`)
        .join(", ")}.`,
    );
  }
} else {
  console.log(
    "Stripe not configured — set STRIPE_SECRET_KEY (and price ids) in backend/.env.",
  );
}



const emailServiceType = process.env.EMAIL_SERVICE_TYPE?.trim().toLowerCase();
const emailSenderSet = Boolean(process.env.SENDER_EMAIL_ID?.trim());
const emailPasswordSet = Boolean(process.env.SENDER_EMAIL_PASSWORD?.trim());
const smtpHostSet = Boolean(process.env.SMTP_HOST?.trim());
if (emailServiceType === "smtp" && smtpHostSet) {
  console.log(`Email configured → smtp ${process.env.SMTP_HOST}`);
} else if (
  (emailServiceType === "gmail" || emailServiceType === "office365") &&
  emailSenderSet &&
  emailPasswordSet
) {
  console.log(`Email configured → ${emailServiceType}`);
} else {
  console.log(
    "Email not configured — set EMAIL_SERVICE_TYPE plus SENDER_EMAIL_ID / SENDER_EMAIL_PASSWORD (or SMTP_HOST) in backend/.env.local, then restart.",
  );
}

const ghlCfg = getGhlPublicConfig();

if (ghlCfg.configured) {

  console.log(`GoHighLevel configured → location ${ghlCfg.locationId}`);

} else if (ghlCfg.hasPrivateIntegrationKey && !ghlCfg.hasLocationId) {

  console.log(

    "GoHighLevel private integration key set — add GHL_LOCATION_ID in backend/.env.local to enable sync.",

  );

} else {

  console.log(

    "GoHighLevel not configured — set PRIVATE_INTEGRATION_KEY and GHL_LOCATION_ID in backend/.env.local.",

  );

}



const __dirname = path.dirname(fileURLToPath(import.meta.url));



async function ensureInvestorQuestionnaireColumn(): Promise<void> {

  await pool.query(

    `ALTER TABLE add_deal_form ADD COLUMN IF NOT EXISTS investor_questionnaire_json text`,

  );

}



async function ensureDealInvestmentInvestNowColumns(): Promise<void> {

  await pool.query(

    `ALTER TABLE deal_investment ADD COLUMN IF NOT EXISTS funding_method text NOT NULL DEFAULT ''`,

  );

}



async function ensureDealFormArchivedColumn(): Promise<void> {

  await pool.query(

    `ALTER TABLE add_deal_form ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false`,

  );

}



async function ensureDealSaasBillingColumns(): Promise<void> {
  await pool.query(`
    ALTER TABLE add_deal_form
      ADD COLUMN IF NOT EXISTS stripe_subscription_id varchar(255),
      ADD COLUMN IF NOT EXISTS stripe_plan_id varchar(64),
      ADD COLUMN IF NOT EXISTS stripe_billing_cycle varchar(32),
      ADD COLUMN IF NOT EXISTS stripe_subscription_status varchar(64) NOT NULL DEFAULT 'none',
      ADD COLUMN IF NOT EXISTS stripe_price_id varchar(255),
      ADD COLUMN IF NOT EXISTS stripe_current_period_end timestamp with time zone,
      ADD COLUMN IF NOT EXISTS saas_billing_starts_at timestamp with time zone,
      ADD COLUMN IF NOT EXISTS extra_company_users_paid integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS extra_company_users_last_payment_ref varchar(255)
  `);
  await pool.query(`
    ALTER TABLE companies DROP COLUMN IF EXISTS saas_billing_starts_at
  `);
  await pool.query(`
    DROP TABLE IF EXISTS platform_settings
  `);
}



async function runMigrations(): Promise<void> {

  const migrationsFolder = path.resolve(__dirname, "..", "migrations");

  await migrate(db, { migrationsFolder });

  await ensureInvestorQuestionnaireColumn();

  await ensureDealInvestmentInvestNowColumns();

  await ensureDealFormArchivedColumn();

  await ensureDealSaasBillingColumns();

  console.log("Database migrations applied.");

}



async function verifyPoolConnection(): Promise<void> {

  const client = await pool.connect();

  client.release();

  console.log("Database pool ready.");

}



async function initDatabaseAfterListen(): Promise<void> {

  try {

    await verifyPoolConnection();

    if (process.env.SKIP_DB_MIGRATIONS === "1") {

      console.warn("SKIP_DB_MIGRATIONS=1 — migrations were not applied.");

    } else {

      await runMigrations();

    }

  } catch (err) {

    const message = err instanceof Error ? err.message : String(err);

    console.error(

      "Database initialization failed. Fix DATABASE_* in backend/.env.local, ensure PostgreSQL is running, then restart.\n",

      message,

    );

    if (process.env.REQUIRE_DB_BEFORE_START === "1") {

      process.exit(1);

    }

  }

}



const listenPort = Number(String(PORT).trim()) || 5004;

app.listen(listenPort, "0.0.0.0", () => {

  console.log(

    `Server listening on http://127.0.0.1:${listenPort} (0.0.0.0:${listenPort})`,

  );

  void initDatabaseAfterListen();

});


