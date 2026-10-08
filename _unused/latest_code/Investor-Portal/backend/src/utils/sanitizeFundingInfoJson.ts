/** Validates and normalizes Funding Info JSON for `add_deal_form.funding_info_json`. */

export class FundingInfoJsonInvalidError extends Error {
  constructor(message = "Invalid funding info payload") {
    super(message);
    this.name = "FundingInfoJsonInvalidError";
  }
}

export class FundingInfoJsonTooLargeError extends Error {
  constructor() {
    super("Funding info payload is too large");
    this.name = "FundingInfoJsonTooLargeError";
  }
}

const MAX_BYTES = 20_000;
const MAX_TEXT_LEN = 8000;
const FEE_METHODS = new Set(["none", "flat", "percent"]);

export type FundingInfoPayload = {
  v: 1;
  achEnabled: boolean;
  wireEnabled: boolean;
  checksEnabled: boolean;
  receivingBankAccount: string;
  investmentFeeMethod: string;
  checkInstructions: string;
};

export const DEFAULT_FUNDING_INFO_JSON = JSON.stringify({
  v: 1,
  achEnabled: false,
  wireEnabled: true,
  checksEnabled: false,
  receivingBankAccount: "",
  investmentFeeMethod: "none",
  checkInstructions: "",
} satisfies FundingInfoPayload);

function clipText(raw: unknown, max = MAX_TEXT_LEN): string {
  if (typeof raw !== "string") return "";
  return raw.slice(0, max);
}

export function sanitizeFundingInfoJson(raw: string): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (t === "") {
    return DEFAULT_FUNDING_INFO_JSON;
  }
  if (t.length > MAX_BYTES) {
    throw new FundingInfoJsonTooLargeError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    throw new FundingInfoJsonInvalidError("Invalid JSON");
  }
  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new FundingInfoJsonInvalidError("Expected a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  const feeRaw =
    typeof o.investmentFeeMethod === "string"
      ? o.investmentFeeMethod.trim()
      : "none";
  const investmentFeeMethod = FEE_METHODS.has(feeRaw) ? feeRaw : "none";
  const out: FundingInfoPayload = {
    v: 1,
    achEnabled: o.achEnabled === true,
    wireEnabled: o.wireEnabled !== false,
    checksEnabled: o.checksEnabled === true,
    receivingBankAccount: clipText(o.receivingBankAccount),
    investmentFeeMethod,
    checkInstructions: clipText(o.checkInstructions),
  };
  const s = JSON.stringify(out);
  if (s.length > MAX_BYTES) {
    throw new FundingInfoJsonTooLargeError();
  }
  return s;
}
