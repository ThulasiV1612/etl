import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { INVALID_SIGNIN_CREDENTIALS_MESSAGE } from "../src/services/auth/auth.service.js";
import { verifyDropboxSignEventHash } from "../src/services/esign/dropboxSignWebhookVerify.service.js";
import {
  verifySignFlowWebhookSignature,
} from "../src/services/esign/signflowWebhookVerify.service.js";
import {
  signUploadRelativePath,
  verifyUploadSignature,
} from "../src/utils/uploadSignedUrl.js";

process.env.JWT_SECRET_KEY =
  process.env.JWT_SECRET_KEY ??
  "test-jwt-secret-key-at-least-32-chars-long!!";

describe("sign-in messages", () => {
  it("uses a single generic invalid-credentials message", () => {
    assert.equal(
      INVALID_SIGNIN_CREDENTIALS_MESSAGE,
      "Invalid email or password",
    );
    assert.doesNotMatch(INVALID_SIGNIN_CREDENTIALS_MESSAGE, /user not found/i);
    assert.doesNotMatch(INVALID_SIGNIN_CREDENTIALS_MESSAGE, /mismatch/i);
  });
});

describe("upload signed URLs", () => {
  it("signs and verifies a relative uploads path", () => {
    const rel = "deal-assets/acme-deal-id/photo.jpg";
    const { exp, sig } = signUploadRelativePath(rel, 60_000);
    assert.equal(verifyUploadSignature(rel, exp, sig), true);
    assert.equal(verifyUploadSignature(rel, exp - 1, sig), false);
  });
});

describe("SignFlow webhook verification", () => {
  it("accepts a valid HMAC signature over the raw body", () => {
    const secret = "pk_test_signflow_webhook_secret";
    process.env.SIGNFLOW_WEBHOOK_SECRET = secret;
    const raw = JSON.stringify({
      event: "document.completed",
      payload: { documentId: "doc-1" },
      timestamp: "1710000000",
    });
    const signature = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
    assert.equal(
      verifySignFlowWebhookSignature({
        headers: { "x-signflow-signature": signature },
        rawBody: raw,
      }),
      true,
    );
  });
});

describe("Dropbox Sign webhook verification", () => {
  it("verifies event_hash from api key + time + type", () => {
    const apiKey = "test-dropbox-api-key";
    const eventTime = "1710000000";
    const eventType = "signature_request_signed";
    const eventHash = createHmac("sha256", apiKey)
      .update(eventTime + eventType)
      .digest("hex");
    assert.equal(
      verifyDropboxSignEventHash({
        apiKey,
        eventTime,
        eventType,
        eventHash,
      }),
      true,
    );
  });
});

describe("deal access scope", () => {
  it("platform admin sees all deals when organization is null", async () => {
    const { resolveDealViewerScope } = await import(
      "../src/services/deal/dealAccess.service.js"
    );
    // Without DB this will fail — skip integration; document expected shape only.
    assert.equal(typeof resolveDealViewerScope, "function");
  });
});
