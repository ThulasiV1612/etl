export type ParsedSignFlowWebhook = {
  eventType: string;
  eventTime: string;
  documentId: string;
  raw: Record<string, unknown>;
};

/** Normalize SignFlow callback body (`{ event, payload, timestamp }`). */
export function parseSignFlowWebhookBody(
  raw: unknown,
): ParsedSignFlowWebhook | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const root = raw as Record<string, unknown>;

  const eventType = String(root.event ?? "").trim();
  const eventTime = String(root.timestamp ?? "").trim();

  const payload =
    root.payload &&
    typeof root.payload === "object" &&
    !Array.isArray(root.payload)
      ? (root.payload as Record<string, unknown>)
      : null;

  const documentId = String(payload?.documentId ?? "").trim();
  if (!eventType || !documentId) return null;

  return {
    eventType,
    eventTime,
    documentId,
    raw: root,
  };
}
