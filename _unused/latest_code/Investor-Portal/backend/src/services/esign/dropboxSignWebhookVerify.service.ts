import { createHmac, timingSafeEqual } from "node:crypto";
import { getDropboxSignConfig } from "../../config/dropboxSign.config.js";

/**
 * Verifies Dropbox Sign event callback authenticity via `event.event_hash`.
 * @see https://developers.hellosign.com/docs/events/walkthrough
 */
export function verifyDropboxSignEventHash(params: {
  eventTime: string;
  eventType: string;
  eventHash: string;
  apiKey?: string;
}): boolean {
  const apiKey = params.apiKey?.trim() || getDropboxSignConfig()?.apiKey?.trim();
  const eventHash = params.eventHash.trim();
  const eventTime = params.eventTime.trim();
  const eventType = params.eventType.trim();
  if (!apiKey || !eventHash || !eventTime || !eventType) return false;

  const expected = createHmac("sha256", apiKey)
    .update(eventTime + eventType)
    .digest("hex");

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(eventHash, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
