const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ETIMEDOUT",
  "ECONNRESET",
]);

function messageLooksUnreachable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("fetch failed") ||
    m.includes("econnrefused") ||
    m.includes("not reachable") ||
    m.includes("signflow is not configured") ||
    m.includes("network error") ||
    m.includes("429") ||
    m.includes("too many requests") ||
    m.includes("rate limit")
  );
}

/** True when Dropbox Sign / SignFlow API is down or unreachable (dev server not started). */
export function isEsignProviderUnreachableError(err: unknown): boolean {
  if (!err) return false;

  if (typeof err === "object" && err !== null) {
    const e = err as Error & {
      code?: string;
      cause?: unknown;
      errors?: unknown[];
    };

    const code = String(e.code ?? "").trim().toUpperCase();
    if (code && UNREACHABLE_CODES.has(code)) return true;

    if (e.message && messageLooksUnreachable(e.message)) return true;

    if (e.cause && isEsignProviderUnreachableError(e.cause)) return true;

    if (Array.isArray(e.errors)) {
      return e.errors.some((child) => isEsignProviderUnreachableError(child));
    }
  }

  return messageLooksUnreachable(String(err));
}

export function formatEsignProviderUnreachableMessage(
  provider: "signflow" | "dropbox",
  baseUrl?: string | null,
): string {
  if (provider === "signflow") {
    const url = baseUrl?.trim() || "SIGNFLOW_API_BASE_URL";
    return `SignFlow API is not reachable at ${url}. Start the SignFlow backend on port 5007 and the SignFlow frontend on port 5177, then try again.`;
  }
  return "Dropbox Sign API is not reachable. Check your network connection and API credentials.";
}
