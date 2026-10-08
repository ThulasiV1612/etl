import { getDropboxSignConfig } from "./dropboxSign.config.js";
import { getSignFlowConfig } from "./signflow.config.js";

export type EsignProviderType = "signflow" | "dropbox";

/** SignFlow takes precedence when both providers are configured. */
export function getActiveEsignProvider(): EsignProviderType | null {
  if (getSignFlowConfig()) return "signflow";
  if (getDropboxSignConfig()) return "dropbox";
  return null;
}

export function requireActiveEsignProvider(): EsignProviderType {
  const provider = getActiveEsignProvider();
  if (!provider) {
    throw new Error(
      "eSign is not configured. Set SIGNFLOW_API_BASE_URL + SIGNFLOW_API_KEY (see API_INTEGRATION.md) or Dropbox Sign credentials.",
    );
  }
  return provider;
}
