import type { Request, Response } from "express";
import { getDropboxSignConfig } from "../../config/dropboxSign.config.js";
import { verifyDropboxSignEventHash } from "../../services/esign/dropboxSignWebhookVerify.service.js";
import { parseDropboxSignWebhookBody } from "../../services/esign/dropboxSignWebhookParse.service.js";
import { applyInvestmentSignatureWebhookEvent } from "../../services/investment/investmentSignature.service.js";
import { handleDealInvestorEsignWebhook } from "../../services/deal/dealMemberEsignCompletion.service.js";

const DROPBOX_WEBHOOK_ACK = "Hello API Event Received";

/**
 * POST /webhooks/dropbox-sign
 * POST /api/webhooks/dropbox-sign
 *
 * Dropbox Sign event callback (no JWT). Verifies `event_hash`, updates
 * `investment_signatures`, then syncs legacy `esign_status_json` rows.
 */
export async function postDropboxSignWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = parseDropboxSignWebhookBody(req.body);
  if (!parsed) {
    console.warn("[dropbox-sign webhook] unparseable payload");
    res.status(200).send(DROPBOX_WEBHOOK_ACK);
    return;
  }

  const cfg = getDropboxSignConfig();
  const production = process.env.NODE_ENV === "production";

  if (cfg) {
    if (!parsed.eventHash) {
      if (production) {
        console.error(
          "[dropbox-sign webhook] missing event_hash — rejected in production",
          parsed.eventType,
        );
        res.status(200).send(DROPBOX_WEBHOOK_ACK);
        return;
      }
      console.warn(
        "[dropbox-sign webhook] missing event_hash — allowed in non-production only",
        parsed.eventType,
      );
    } else {
      const valid = verifyDropboxSignEventHash({
        apiKey: cfg.apiKey,
        eventTime: parsed.eventTime,
        eventType: parsed.eventType,
        eventHash: parsed.eventHash,
      });
      if (!valid) {
        console.error(
          "[dropbox-sign webhook] event_hash verification failed",
          parsed.eventType,
          parsed.signatureRequestId,
        );
        res.status(200).send(DROPBOX_WEBHOOK_ACK);
        return;
      }
    }
  }

  try {
    const sigResult = await applyInvestmentSignatureWebhookEvent({
      signatureRequestId: parsed.signatureRequestId,
      eventType: parsed.eventType,
      webhookPayload: parsed.raw,
      eventTime: parsed.eventTime,
    });

    if (!sigResult.updated) {
      console.info(
        "[dropbox-sign webhook] no investment_signatures row",
        parsed.signatureRequestId,
        parsed.eventType,
      );
    }

    if (parsed.dealId) {
      await handleDealInvestorEsignWebhook({
        dealId: parsed.dealId,
        rosterId: parsed.rosterId || undefined,
        signatureRequestId: parsed.signatureRequestId,
        eventType: parsed.eventType,
        eventTime: parsed.eventTime,
      });
    }
  } catch (err) {
    console.error("[dropbox-sign webhook] handler error:", err);
  }

  res.status(200).send(DROPBOX_WEBHOOK_ACK);
}
