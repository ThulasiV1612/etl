import type { Request, Response } from "express";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import {
  deleteDealInvestorCommunicationMail,
  listDealInvestorCommunicationMails,
  sendDealInvestorCommunicationMail,
} from "../../services/deal/dealInvestorCommunicationMail.service.js";
import { getViewerCoSponsorEmailIntercept } from "../../services/deal/dealCoSponsorEmailIntercept.service.js";

function paramDealId(req: Request): string {
  const raw = req.params.dealId;
  return typeof raw === "string" ? raw.trim() : String(raw?.[0] ?? "").trim();
}

function paramMailId(req: Request): string {
  const raw = req.params.mailId;
  return typeof raw === "string" ? raw.trim() : String(raw?.[0] ?? "").trim();
}

function bodyString(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

async function assertDealReadable(
  req: Request,
  res: Response,
  dealId: string,
): Promise<boolean> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return false;
  }
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return false;
  }
  const scope = await resolveDealViewerScope(
    user.id,
    user.userRole,
    requestedOrganizationIdFromRequest(req),
  );
  if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
    res.status(404).json({ message: "Deal not found" });
    return false;
  }
  return true;
}

/** GET /deals/:dealId/investor-communication/mails */
export async function getDealInvestorCommunicationMails(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId = paramDealId(req);
  if (!(await assertDealReadable(req, res, dealId))) return;
  try {
    const mails = await listDealInvestorCommunicationMails(dealId, user.id);
    const intercept = await getViewerCoSponsorEmailIntercept(dealId, user.id);
    res.status(200).json({
      mails,
      viewerCoSponsorEmailIntercept: intercept,
    });
  } catch (err) {
    console.error("getDealInvestorCommunicationMails:", err);
    res.status(500).json({ message: "Could not load investor communication email log" });
  }
}

/** POST /deals/:dealId/investor-communication/mails */
export async function postDealInvestorCommunicationMail(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId = paramDealId(req);
  if (!(await assertDealReadable(req, res, dealId))) return;

  const b = req.body as Record<string, unknown>;
  const templateId = bodyString(b.templateId).trim() || null;
  const subject = bodyString(b.subject).trim();
  const bodyHtml = bodyString(b.bodyHtml);
  const bodyText = bodyString(b.bodyText);
  const cc = Array.isArray(b.cc)
    ? b.cc.map((x) => String(x).trim()).filter((x) => x.includes("@"))
    : [];
  const recipientUsers = b.recipientUsers;
  const deliveryEmails = Array.isArray(b.deliveryEmails)
    ? b.deliveryEmails.map((x) => String(x).trim()).filter((x) => x.includes("@"))
    : [];

  try {
    const result = await sendDealInvestorCommunicationMail({
      dealId,
      senderId: user.id,
      templateId,
      subject,
      bodyHtml,
      bodyText,
      cc,
      recipientUsers: Array.isArray(recipientUsers) ? recipientUsers : [],
      deliveryEmails,
    });
    if (!result.ok) {
      res.status(500).json({
        sent: false,
        message: result.message,
        mail: result.row ?? null,
      });
      return;
    }
    res.status(200).json({ sent: true, mail: result.row });
  } catch (err) {
    console.error("postDealInvestorCommunicationMail:", err);
    res.status(500).json({ message: "Could not send investor communication email" });
  }
}

/** DELETE /deals/:dealId/investor-communication/mails/:mailId */
export async function deleteDealInvestorCommunicationMailHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const dealId = paramDealId(req);
  const mailId = paramMailId(req);
  if (!(await assertDealReadable(req, res, dealId))) return;
  if (!mailId) {
    res.status(400).json({ message: "Missing email log id" });
    return;
  }
  try {
    const deleted = await deleteDealInvestorCommunicationMail(dealId, mailId);
    if (!deleted) {
      res.status(404).json({ message: "Email log entry not found" });
      return;
    }
    res.status(200).json({ deleted: true });
  } catch (err) {
    console.error("deleteDealInvestorCommunicationMailHandler:", err);
    res.status(500).json({ message: "Could not delete email log entry" });
  }
}
