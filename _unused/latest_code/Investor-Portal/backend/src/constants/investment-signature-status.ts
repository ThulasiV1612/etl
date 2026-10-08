export const INVESTMENT_SIGNATURE_STATUSES = [
  "Sent",
  "Viewed",
  "Signed",
  "Completed",
] as const;

export type InvestmentSignatureStatus =
  (typeof INVESTMENT_SIGNATURE_STATUSES)[number];

const STATUS_RANK: Record<InvestmentSignatureStatus, number> = {
  Sent: 1,
  Viewed: 2,
  Signed: 3,
  Completed: 4,
};

export function isInvestmentSignatureStatus(
  raw: string,
): raw is InvestmentSignatureStatus {
  return (INVESTMENT_SIGNATURE_STATUSES as readonly string[]).includes(raw);
}

/** Map Dropbox Sign `event.event_type` → stored workflow status. */
export function mapDropboxEventToInvestmentSignatureStatus(
  eventType: string,
): InvestmentSignatureStatus | null {
  const e = eventType.trim().toLowerCase();
  switch (e) {
    case "signature_request_sent":
      return "Sent";
    case "signature_request_viewed":
      return "Viewed";
    case "signature_request_signed":
      return "Signed";
    case "signature_request_all_signed":
    case "signature_request_completed":
      return "Completed";
    default:
      return null;
  }
}

/** Map SignFlow webhook `event` → stored workflow status. */
export function mapSignFlowEventToInvestmentSignatureStatus(
  eventType: string,
): InvestmentSignatureStatus | null {
  const e = eventType.trim().toLowerCase();
  switch (e) {
    case "document.sent":
      return "Sent";
    case "document.viewed":
      return "Viewed";
    case "document.completed":
      return "Completed";
    default:
      return null;
  }
}

/** Map webhook event from either eSign provider → stored workflow status. */
export function mapEsignWebhookEventToInvestmentSignatureStatus(
  eventType: string,
): InvestmentSignatureStatus | null {
  return (
    mapSignFlowEventToInvestmentSignatureStatus(eventType) ??
    mapDropboxEventToInvestmentSignatureStatus(eventType)
  );
}

/** Never downgrade workflow status when multiple events arrive out of order. */
export function maxInvestmentSignatureStatus(
  current: InvestmentSignatureStatus,
  next: InvestmentSignatureStatus,
): InvestmentSignatureStatus {
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current;
}
