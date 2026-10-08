/**
 * Dropbox Sign (HelloSign) credentials — loaded only from environment variables.
 * Never hard-code API keys in source files.
 *
 * Set in `backend/.env` or `backend/.env.local`:
 *   DROPBOX_SIGN_API_KEY     — API key from https://app.hellosign.com/home/myAccount#api
 *   DROPBOX_SIGN_CLIENT_ID   — OAuth app Client ID (required for embedded flows)
 *   DROPBOX_SIGN_TEST_MODE   — "true" | "1" for sandbox requests (shows non-binding banner in embedded UI)
 */
export type DropboxSignConfig = {
  apiKey: string;
  clientId: string;
  testMode: boolean;
};

export function getDropboxSignConfig(): DropboxSignConfig | null {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY?.trim() ?? "";
  const clientId = process.env.DROPBOX_SIGN_CLIENT_ID?.trim() ?? "";
  if (!apiKey || !clientId) return null;

  const testRaw = (process.env.DROPBOX_SIGN_TEST_MODE ?? "false").trim().toLowerCase();
  const testMode = testRaw === "1" || testRaw === "true" || testRaw === "yes";

  return { apiKey, clientId, testMode };
}

export function requireDropboxSignConfig(): DropboxSignConfig {
  const cfg = getDropboxSignConfig();
  if (!cfg) {
    throw new Error(
      "Dropbox Sign is not configured. Set DROPBOX_SIGN_API_KEY and DROPBOX_SIGN_CLIENT_ID in backend/.env",
    );
  }
  return cfg;
}
