import type { Request, Response } from "express";
import type { RawBodyRequest } from "../../middleware/stripeWebhook.middleware.js";
import { getStripeConfig } from "../../config/stripe.config.js";
import {
  getStripeClient,
  handleStripeWebhookEvent,
} from "../../services/billing/companyBilling.service.js";
// Investor contributions: workflow — Stripe Checkout disabled for now
// import { handleInvestorCheckoutWebhookEvent } from "../../services/payments/investorCheckout.service.js";
import { handleDistributionConnectWebhookEvent } from "../../services/payments/investorDistributionPayout.service.js";

function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production" ||
    process.env.DEPLOY_ENV === "production"
  );
}

/**
 * POST /webhooks/stripe
 * POST /api/webhooks/stripe
 *
 * Local: set STRIPE_WEBHOOK_SECRET from `stripe listen` (or Dashboard+ngrok).
 * Production: set STRIPE_WEBHOOK_SECRET from the domain webhook endpoint.
 * Never skip signature verification in production.
 */
export async function postStripeWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const cfg = getStripeConfig();
  if (!cfg) {
    console.warn("[stripe webhook] Stripe is not configured");
    res.status(503).json({ message: "Stripe is not configured" });
    return;
  }

  const signature = req.headers["stripe-signature"];
  const sig =
    typeof signature === "string"
      ? signature
      : Array.isArray(signature)
        ? signature[0]
        : "";

  const raw = (req as RawBodyRequest).rawBody;
  if (!raw || !Buffer.isBuffer(raw)) {
    console.error("[stripe webhook] missing raw body");
    res.status(400).json({ message: "Raw body required" });
    return;
  }

  let event;
  try {
    const stripe = getStripeClient();
    const allowSkip =
      !isProductionRuntime() &&
      (process.env.STRIPE_WEBHOOK_SKIP_VERIFY === "1" ||
        process.env.STRIPE_WEBHOOK_SKIP_VERIFY === "true");

    if (!cfg.webhookSecret) {
      if (allowSkip) {
        event = JSON.parse(raw.toString("utf8"));
        console.warn(
          "[stripe webhook] STRIPE_WEBHOOK_SECRET unset — accepting unverified event (dev only)",
        );
      } else {
        res.status(503).json({
          message:
            "STRIPE_WEBHOOK_SECRET is not set. Local: run stripe listen and paste whsec_. Production: use Dashboard webhook signing secret.",
        });
        return;
      }
    } else {
      if (!sig) {
        res.status(400).json({ message: "Missing stripe-signature header" });
        return;
      }
      event = stripe.webhooks.constructEvent(raw, sig, cfg.webhookSecret);
    }
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    res.status(400).json({ message: "Invalid signature" });
    return;
  }

  try {
    const connectHandled =
      await handleDistributionConnectWebhookEvent(event);
    // Investor contributions: workflow — Stripe Checkout disabled for now
    // const investorCheckoutHandled = connectHandled
    //   ? false
    //   : await handleInvestorCheckoutWebhookEvent(event);
    const investorCheckoutHandled = false;
    if (!connectHandled && !investorCheckoutHandled) {
      await handleStripeWebhookEvent(event);
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    res.status(500).json({ message: "Webhook handler failed" });
  }
}
