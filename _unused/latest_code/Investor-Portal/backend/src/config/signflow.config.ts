/**
 * SignFlow credentials — loaded only from environment variables.
 * See API_INTEGRATION.md at the repo root.
 *
 * Set in `backend/.env` or `backend/.env.local`:
 *   SIGNFLOW_API_BASE_URL — e.g. http://localhost:5007/api/v1
 *   SIGNFLOW_API_KEY      — org API key (pk_test_... or pk_live_...)
 */
export type SignFlowConfig = {
  baseUrl: string;
  apiKey: string;
  testMode: boolean;
  /** SignFlow web UI root for embedded editor/signing iframes. */
  appBaseUrl: string;
  /** Key safe to expose to the browser for embedded flows (sandbox only by default). */
  embedApiKey: string | null;
};

function isSignFlowTestKey(apiKey: string): boolean {
  return apiKey.startsWith("pk_test_");
}

function resolveSignFlowAppBaseUrl(apiBaseUrl: string): string {
  const explicit = process.env.SIGNFLOW_APP_BASE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const normalizedApi = apiBaseUrl.replace(/\/$/, "");
  if (/^https?:\/\/localhost:5007(?:\/api\/v\d+)?$/i.test(normalizedApi)) {
    return "http://localhost:5177";
  }
  if (/^https?:\/\/127\.0\.0\.1:5007(?:\/api\/v\d+)?$/i.test(normalizedApi)) {
    return "http://127.0.0.1:5177";
  }

  return apiBaseUrl.replace(/\/api\/v\d+$/i, "") || apiBaseUrl;
}

export function getSignFlowConfig(): SignFlowConfig | null {
  const baseUrl = process.env.SIGNFLOW_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  const apiKey = process.env.SIGNFLOW_API_KEY?.trim() ?? "";
  if (!baseUrl || !apiKey) return null;

  const testMode = isSignFlowTestKey(apiKey);
  const embedKey =
    process.env.SIGNFLOW_EMBED_API_KEY?.trim() ||
    (testMode ? apiKey : null);

  return {
    baseUrl,
    apiKey,
    testMode,
    appBaseUrl: resolveSignFlowAppBaseUrl(baseUrl),
    embedApiKey: embedKey || null,
  };
}

export function requireSignFlowConfig(): SignFlowConfig {
  const cfg = getSignFlowConfig();
  if (!cfg) {
    throw new Error(
      "SignFlow is not configured. Set SIGNFLOW_API_BASE_URL and SIGNFLOW_API_KEY in backend/.env (see API_INTEGRATION.md).",
    );
  }
  return cfg;
}

/** Safe for API responses — never exposes the server API key (pk_live). */
export function getSignFlowPublicConfig(): {
  configured: boolean;
  testMode: boolean;
  baseUrl: string | null;
  appBaseUrl: string | null;
  embedApiKey: string | null;
  provider: "signflow";
} {
  const cfg = getSignFlowConfig();
  if (!cfg) {
    return {
      configured: false,
      testMode: false,
      baseUrl: null,
      appBaseUrl: null,
      embedApiKey: null,
      provider: "signflow",
    };
  }
  return {
    configured: true,
    testMode: cfg.testMode,
    baseUrl: cfg.baseUrl,
    appBaseUrl: cfg.appBaseUrl,
    embedApiKey: cfg.embedApiKey,
    provider: "signflow",
  };
}
