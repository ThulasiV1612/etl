import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdInViewerScope,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import { sendDealDocumentSharedEmail } from "../../services/deal/dealDocumentSharedEmail.service.js";
import { resolveDealDocumentSharedRecipients } from "../../services/deal/dealDocumentSharedAudience.service.js";

function bodyString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

type RecipientInput = {
  to_email: string;
  member_display_name?: string;
};

function parseRecipients(raw: unknown): RecipientInput[] {
  if (!Array.isArray(raw)) return [];
  const out: RecipientInput[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const to_email = bodyString(o.to_email ?? o.toEmail);
    if (!to_email.includes("@")) continue;
    const member_display_name = bodyString(
      o.member_display_name ?? o.memberDisplayName,
    );
    out.push({
      to_email: to_email.trim(),
      member_display_name: member_display_name.trim() || undefined,
    });
  }
  return out;
}

function parseDocumentNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => bodyString(n).trim()).filter(Boolean);
}

function parseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => bodyString(id).trim()).filter(Boolean);
}

function parseAudience(raw: unknown): {
  allInvestors: boolean;
  investorIds: string[];
  sponsorUserIds: string[];
  classIds: string[];
} {
  if (raw == null || typeof raw !== "object") {
    return {
      allInvestors: false,
      investorIds: [],
      sponsorUserIds: [],
      classIds: [],
    };
  }
  const o = raw as Record<string, unknown>;
  const allRaw = o.all_investors ?? o.allInvestors;
  return {
    allInvestors: allRaw === true || allRaw === "true" || allRaw === 1,
    investorIds: parseIdList(o.investor_ids ?? o.investorIds),
    sponsorUserIds: parseIdList(o.sponsor_user_ids ?? o.sponsorUserIds),
    classIds: parseIdList(o.class_ids ?? o.classIds),
  };
}

/**
 * POST /deals/:dealId/documents/send-shared-notification
 * Body: {
 *   recipients?: { to_email: string; member_display_name?: string }[]
 *   audience?: {
 *     all_investors?: boolean
 *     investor_ids?: string[]
 *     sponsor_user_ids?: string[]
 *     class_ids?: string[]
 *   }
 *   document_names: string[]
 * }
 *
 * Audience is resolved on the server (unredacted emails), including co-sponsor
 * LPs whose addresses are hidden from lead/admin in the Documents tab UI.
 */
export async function postDealDocumentSharedNotification(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }

  const b = req.body as Record<string, unknown>;
  const clientRecipients = parseRecipients(b.recipients);
  const audience = parseAudience(b.audience);
  const documentNames = parseDocumentNames(b.document_names ?? b.documentNames);

  if (documentNames.length === 0) {
    res.status(400).json({ message: "At least one document name is required" });
    return;
  }

  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }

    const recipients = await resolveDealDocumentSharedRecipients({
      dealId,
      viewerUserId: user.id,
      audience,
      extraRecipients: clientRecipients.map((r) => ({
        toEmail: r.to_email,
        memberDisplayName: r.member_display_name,
      })),
    });

    if (recipients.length === 0) {
      res.status(400).json({
        message: "At least one recipient with a valid email is required",
      });
      return;
    }

    const failures: { email: string; message: string }[] = [];
    let sent = 0;
    const seen = new Set<string>();

    for (const r of recipients) {
      const key = r.toEmail.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const result = await sendDealDocumentSharedEmail({
        dealId,
        toEmail: r.toEmail,
        memberDisplayName: r.memberDisplayName,
        documentNames,
      });
      if (result.ok) {
        sent += 1;
      } else {
        const msg =
          result.error instanceof Error
            ? result.error.message
            : "Could not send email";
        failures.push({ email: r.toEmail, message: msg });
      }
    }

    if (sent === 0) {
      res.status(502).json({
        message: "Could not send notification emails",
        sent: 0,
        failures,
      });
      return;
    }

    res.status(200).json({
      message:
        failures.length > 0
          ? `Sent ${sent} email(s); ${failures.length} failed`
          : `Sent ${sent} email(s)`,
      sent,
      failures,
    });
  } catch (err) {
    console.error("postDealDocumentSharedNotification:", err);
    res.status(500).json({ message: "Could not send document notifications" });
  }
}
