export type ParsedDropboxSignWebhook = {
  eventType: string;
  eventTime: string;
  eventHash: string;
  signatureRequestId: string;
  dealId: string;
  rosterId: string;
  investmentId: string;
  investorId: string;
  raw: Record<string, unknown>;
};

function metadataString(
  metadata: Record<string, unknown> | undefined,
  ...keys: string[]
): string {
  if (!metadata) return "";
  for (const key of keys) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Normalize Dropbox Sign callback body (`json` field or raw JSON object). */
export function parseDropboxSignWebhookBody(raw: unknown): ParsedDropboxSignWebhook | null {
  let body: unknown = raw;
  if (body && typeof body === "object" && "json" in body) {
    const j = (body as { json?: unknown }).json;
    if (typeof j === "string") {
      try {
        body = JSON.parse(j) as unknown;
      } catch {
        return null;
      }
    } else if (j && typeof j === "object") {
      body = j;
    }
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const root = body as Record<string, unknown>;

  const event =
    root.event && typeof root.event === "object" && !Array.isArray(root.event)
      ? (root.event as Record<string, unknown>)
      : null;

  const signatureRequest =
    root.signature_request &&
    typeof root.signature_request === "object" &&
    !Array.isArray(root.signature_request)
      ? (root.signature_request as Record<string, unknown>)
      : null;

  const metadata =
    signatureRequest?.metadata &&
    typeof signatureRequest.metadata === "object" &&
    !Array.isArray(signatureRequest.metadata)
      ? (signatureRequest.metadata as Record<string, unknown>)
      : undefined;

  const eventType = String(event?.event_type ?? "").trim();
  const signatureRequestId = String(
    signatureRequest?.signature_request_id ?? "",
  ).trim();

  if (!eventType || !signatureRequestId) return null;

  return {
    eventType,
    eventTime: String(event?.event_time ?? "").trim(),
    eventHash: String(event?.event_hash ?? "").trim(),
    signatureRequestId,
    dealId: metadataString(metadata, "deal_id", "dealId"),
    rosterId: metadataString(metadata, "roster_id", "rosterId"),
    investmentId: metadataString(metadata, "investment_id", "investmentId"),
    investorId: metadataString(metadata, "investor_id", "investorId"),
    raw: root,
  };
}
