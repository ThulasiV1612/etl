import Stripe from "stripe";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { resolveFrontendOrigin } from "../../config/stripe.config.js";
import { isDocSignedEsignCompleted } from "../../constants/deal-doc-signed.js";
import {
  dealInvestment,
  investorCheckoutPayments,
  users,
} from "../../schema/schema.js";
import { getStripeClient } from "../billing/companyBilling.service.js";
import { readMyInvestNowCommitment } from "../deal/dealLpInvestorMyInvestNowCommitment.read.service.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return UUID_RE.test(value) ? value : null;
}

function centsFromStoredAmount(raw: string): number | null {
  const amount = Number(String(raw ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents >= 50 ? cents : null;
}

function stripeId(
  value: string | { id?: string | null } | null | undefined,
): string | null {
  if (typeof value === "string") return value.trim() || null;
  return value?.id?.trim() || null;
}

export type InvestorCheckoutResult =
  | { ok: true; url: string; sessionId: string; paymentStatus: string }
  | { ok: false; status: number; message: string };

/**
 * Creates a one-time Checkout Session for a signed, saved investment.
 * The amount is always loaded from the database; the client cannot choose it.
 */
export async function createInvestorCheckoutSession(params: {
  dealId: string;
  investmentId: string;
  investorUserId: string;
  investorEmail: string;
}): Promise<InvestorCheckoutResult> {
  const dealId = uuid(params.dealId);
  const investmentId = uuid(params.investmentId);
  const userId = uuid(params.investorUserId);
  const email = String(params.investorEmail ?? "").trim().toLowerCase();
  if (!dealId || !investmentId || !userId) {
    return { ok: false, status: 400, message: "Invalid deal or investment id" };
  }
  if (!email.includes("@")) {
    return {
      ok: false,
      status: 400,
      message: "Your account needs a valid email address before payment.",
    };
  }

  const ownership = await readMyInvestNowCommitment({
    dealId,
    viewerEmailNorm: email,
    viewerUserId: userId,
    investmentId,
  });
  if (!ownership.ok || ownership.investmentId !== investmentId) {
    return { ok: false, status: 404, message: "Investment not found" };
  }

  const [investment] = await db
    .select()
    .from(dealInvestment)
    .where(
      and(
        eq(dealInvestment.id, investmentId),
        eq(dealInvestment.dealId, dealId),
      ),
    )
    .limit(1);
  if (!investment) {
    return { ok: false, status: 404, message: "Investment not found" };
  }
  if (!isDocSignedEsignCompleted(investment.docSignedDate)) {
    return {
      ok: false,
      status: 409,
      message: "Complete all required signatures before funding the investment.",
    };
  }

  const amountCents = centsFromStoredAmount(investment.commitmentAmount);
  if (!amountCents) {
    return {
      ok: false,
      status: 400,
      message: "The saved commitment amount is invalid.",
    };
  }

  const [alreadyPaid] = await db
    .select({ id: investorCheckoutPayments.id })
    .from(investorCheckoutPayments)
    .where(
      and(
        eq(investorCheckoutPayments.investmentId, investmentId),
        eq(investorCheckoutPayments.status, "succeeded"),
      ),
    )
    .limit(1);
  if (alreadyPaid) {
    return {
      ok: false,
      status: 409,
      message: "This investment has already been funded.",
    };
  }

  const frontend = resolveFrontendOrigin();
  if (!frontend) {
    return {
      ok: false,
      status: 503,
      message: "BASE_URL must be configured for Stripe Checkout redirects.",
    };
  }

  const stripe = getStripeClient();
  try {
    const [latestAttempt] = await db
      .select()
      .from(investorCheckoutPayments)
      .where(eq(investorCheckoutPayments.investmentId, investmentId))
      .orderBy(desc(investorCheckoutPayments.createdAt))
      .limit(1);
    if (
      latestAttempt &&
      (latestAttempt.status === "created" ||
        latestAttempt.status === "processing")
    ) {
      const existing = await stripe.checkout.sessions.retrieve(
        latestAttempt.stripeCheckoutSessionId,
      );
      if (existing.url && existing.status === "open") {
        return {
          ok: true,
          url: existing.url,
          sessionId: existing.id,
          paymentStatus: latestAttempt.status,
        };
      }
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card", "us_bank_account"],
        customer_email: email,
        client_reference_id: investmentId,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Investment commitment · ${investment.contactDisplayName || "Investor"}`,
                metadata: { dealId, investmentId },
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          flow: "investor_investment",
          dealId,
          investmentId,
          investorUserId: userId,
        },
        payment_intent_data: {
          metadata: {
            flow: "investor_investment",
            dealId,
            investmentId,
            investorUserId: userId,
          },
        },
        payment_method_options: {
          us_bank_account: {
            financial_connections: { permissions: ["payment_method"] },
          },
        },
        success_url: `${frontend}/investing/investments?investment_payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontend}/investing/investments?investment_payment=cancel`,
      },
      {
        idempotencyKey: `investor_checkout_${investmentId}_${amountCents}_${latestAttempt?.id ?? "initial"}`,
      },
    );

    if (!session.url) {
      return {
        ok: false,
        status: 502,
        message: "Stripe did not return a Checkout URL.",
      };
    }

    await db.insert(investorCheckoutPayments).values({
      investmentId,
      dealId,
      investorUserId: userId,
      stripeCheckoutSessionId: session.id,
      amountCents,
      currency: "usd",
      status: "created",
    });

    return {
      ok: true,
      url: session.url,
      sessionId: session.id,
      paymentStatus: "created",
    };
  } catch (err) {
    // A retried request may reuse Stripe's idempotent Session. Return the latest
    // still-payable local attempt instead of creating duplicate obligations.
    const [latest] = await db
      .select()
      .from(investorCheckoutPayments)
      .where(eq(investorCheckoutPayments.investmentId, investmentId))
      .orderBy(desc(investorCheckoutPayments.createdAt))
      .limit(1);
    if (latest && latest.amountCents === amountCents) {
      try {
        const existing = await stripe.checkout.sessions.retrieve(
          latest.stripeCheckoutSessionId,
        );
        if (existing.url && existing.status === "open") {
          return {
            ok: true,
            url: existing.url,
            sessionId: existing.id,
            paymentStatus: latest.status,
          };
        }
      } catch {
        /* report original error */
      }
    }
    console.error("createInvestorCheckoutSession:", err);
    const message =
      err instanceof Error ? err.message : "Could not start investor Checkout";
    return { ok: false, status: 502, message };
  }
}

async function markInvestorPayment(params: {
  sessionId?: string | null;
  paymentIntentId?: string | null;
  investmentId?: string | null;
  status: "processing" | "succeeded" | "failed" | "expired" | "refunded";
  failureMessage?: string | null;
  actualAmountCents?: number | null;
}): Promise<boolean> {
  const sessionId = String(params.sessionId ?? "").trim();
  const paymentIntentId = String(params.paymentIntentId ?? "").trim();
  const investmentId = uuid(params.investmentId);
  let rows: Array<typeof investorCheckoutPayments.$inferSelect> = [];
  if (sessionId) {
    rows = await db
      .select()
      .from(investorCheckoutPayments)
      .where(eq(investorCheckoutPayments.stripeCheckoutSessionId, sessionId))
      .limit(1);
  } else if (paymentIntentId) {
    rows = await db
      .select()
      .from(investorCheckoutPayments)
      .where(eq(investorCheckoutPayments.stripePaymentIntentId, paymentIntentId))
      .limit(1);
  }
  if (rows.length === 0 && investmentId) {
    rows = await db
      .select()
      .from(investorCheckoutPayments)
      .where(eq(investorCheckoutPayments.investmentId, investmentId))
      .orderBy(desc(investorCheckoutPayments.createdAt))
      .limit(1);
  }
  const payment = rows[0];
  if (!payment) return false;

  const amountMismatch =
    params.actualAmountCents != null &&
    params.actualAmountCents !== payment.amountCents;
  const nextStatus = amountMismatch ? "failed" : params.status;
  const failureMessage = amountMismatch
    ? "Stripe payment amount did not match the saved commitment."
    : params.failureMessage?.trim() || null;
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(investorCheckoutPayments)
      .set({
        status: nextStatus,
        stripePaymentIntentId: paymentIntentId || payment.stripePaymentIntentId,
        failureMessage,
        paidAt: nextStatus === "succeeded" ? now : payment.paidAt,
        updatedAt: now,
      })
      .where(eq(investorCheckoutPayments.id, payment.id));

    if (nextStatus === "succeeded") {
      await tx
        .update(dealInvestment)
        .set({
          fundApproved: true,
          fundApprovedBy: null,
          fundApprovedAt: now,
          fundApprovedCommitmentSnapshot: String(payment.amountCents / 100),
          fundingMethod: "stripe_checkout",
        })
        .where(eq(dealInvestment.id, payment.investmentId));
    } else if (nextStatus === "refunded") {
      await tx
        .update(dealInvestment)
        .set({
          fundApproved: false,
          fundApprovedAt: null,
          fundApprovedCommitmentSnapshot: "",
        })
        .where(eq(dealInvestment.id, payment.investmentId));
    }
  });
  return true;
}

export async function syncInvestorCheckoutSession(params: {
  sessionId: string;
  investorUserId: string;
}): Promise<
  | { ok: true; paymentStatus: string }
  | { ok: false; status: number; message: string }
> {
  const sessionId = String(params.sessionId ?? "").trim();
  const userId = uuid(params.investorUserId);
  if (!sessionId.startsWith("cs_") || !userId) {
    return { ok: false, status: 400, message: "Invalid Checkout session" };
  }
  const [local] = await db
    .select()
    .from(investorCheckoutPayments)
    .where(
      and(
        eq(investorCheckoutPayments.stripeCheckoutSessionId, sessionId),
        eq(investorCheckoutPayments.investorUserId, userId),
      ),
    )
    .limit(1);
  if (!local) {
    return { ok: false, status: 404, message: "Checkout session not found" };
  }

  const session = await getStripeClient().checkout.sessions.retrieve(sessionId);
  const paymentIntentId = stripeId(session.payment_intent);
  if (session.payment_status === "paid") {
    await markInvestorPayment({
      sessionId,
      paymentIntentId,
      status: "succeeded",
      actualAmountCents: session.amount_total,
    });
  } else if (session.status === "expired") {
    await markInvestorPayment({
      sessionId,
      paymentIntentId,
      status: "expired",
    });
  } else if (session.status === "complete") {
    await markInvestorPayment({
      sessionId,
      paymentIntentId,
      status: "processing",
      actualAmountCents: session.amount_total,
    });
  }

  const [updated] = await db
    .select({ status: investorCheckoutPayments.status })
    .from(investorCheckoutPayments)
    .where(eq(investorCheckoutPayments.id, local.id))
    .limit(1);
  return { ok: true, paymentStatus: updated?.status ?? local.status };
}

/**
 * Handles only investor-contribution Stripe events. Returns false for company
 * billing and unrelated Stripe events so the shared webhook can continue.
 */
export async function handleInvestorCheckoutWebhookEvent(
  event: Stripe.Event,
): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.flow !== "investor_investment") return false;
      const paymentIntentId = stripeId(session.payment_intent);
      if (
        event.type === "checkout.session.async_payment_succeeded" ||
        session.payment_status === "paid"
      ) {
        await markInvestorPayment({
          sessionId: session.id,
          paymentIntentId,
          status: "succeeded",
          actualAmountCents: session.amount_total,
        });
      } else if (event.type === "checkout.session.async_payment_failed") {
        await markInvestorPayment({
          sessionId: session.id,
          paymentIntentId,
          status: "failed",
          failureMessage: "The bank payment failed.",
        });
      } else if (event.type === "checkout.session.expired") {
        await markInvestorPayment({
          sessionId: session.id,
          paymentIntentId,
          status: "expired",
        });
      } else {
        await markInvestorPayment({
          sessionId: session.id,
          paymentIntentId,
          status: "processing",
          actualAmountCents: session.amount_total,
        });
      }
      return true;
    }
    case "payment_intent.processing":
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.flow !== "investor_investment") return false;
      await markInvestorPayment({
        paymentIntentId: pi.id,
        investmentId: pi.metadata?.investmentId,
        status:
          event.type === "payment_intent.succeeded"
            ? "succeeded"
            : event.type === "payment_intent.processing"
              ? "processing"
              : "failed",
        actualAmountCents:
          event.type === "payment_intent.succeeded"
            ? pi.amount_received
            : pi.amount,
        failureMessage: pi.last_payment_error?.message,
      });
      return true;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      // A partial refund does not mean the investment is wholly unfunded.
      if (!charge.refunded) return false;
      const paymentIntentId = stripeId(charge.payment_intent);
      if (!paymentIntentId) return false;
      return markInvestorPayment({
        paymentIntentId,
        status: "refunded",
      });
    }
    default:
      return false;
  }
}
