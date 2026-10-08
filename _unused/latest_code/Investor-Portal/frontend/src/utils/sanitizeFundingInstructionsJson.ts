/** Validates and normalizes Funding Info JSON for `add_deal_form.funding_instructions_json`. */

export class FundingInstructionsJsonInvalidError extends Error {
  constructor(message = "Invalid funding instructions payload") {
    super(message);
    this.name = "FundingInstructionsJsonInvalidError";
  }
}

export class FundingInstructionsJsonTooLargeError extends Error {
  constructor() {
    super("Funding instructions payload is too large");
    this.name = "FundingInstructionsJsonTooLargeError";
  }
}

const MAX_BYTES = 100_000;
const MAX_FIELD_LEN = 8000;
const FEE_METHODS = new Set(["none", "flat", "percent"]);
const FEE_HANDLING = new Set(["in_addition", "included"]);
const ACCOUNT_TYPES = new Set(["checking", "savings"]);

function clipStr(v: unknown, max = MAX_FIELD_LEN): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function clipBool(v: unknown): boolean {
  return v === true;
}

function clipAccountType(v: unknown): "checking" | "savings" {
  const s = typeof v === "string" ? v : "";
  return ACCOUNT_TYPES.has(s) ? (s as "checking" | "savings") : "checking";
}

function clipFeeMethod(v: unknown): "none" | "flat" | "percent" {
  const s = typeof v === "string" ? v : "";
  return FEE_METHODS.has(s) ? (s as "none" | "flat" | "percent") : "none";
}

function clipFeeHandling(v: unknown): "in_addition" | "included" {
  const s = typeof v === "string" ? v : "";
  return FEE_HANDLING.has(s) ? (s as "in_addition" | "included") : "in_addition";
}

function readObj(v: unknown): Record<string, unknown> {
  if (v == null || typeof v !== "object" || Array.isArray(v)) {
    throw new FundingInstructionsJsonInvalidError();
  }
  return v as Record<string, unknown>;
}

function readSectionObj(v: unknown): Record<string, unknown> {
  if (v == null || typeof v !== "object" || Array.isArray(v)) {
    return {};
  }
  return v as Record<string, unknown>;
}

export function sanitizeFundingInstructionsJson(raw: string): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (t === "") {
    return JSON.stringify({ v: 1 });
  }
  if (t.length > MAX_BYTES) {
    throw new FundingInstructionsJsonTooLargeError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    throw new FundingInstructionsJsonInvalidError("Invalid JSON");
  }
  const root = readObj(parsed);
  const ach = readSectionObj(root.ach);
  const wire = readSectionObj(root.wire);
  const checks = readSectionObj(root.checks);
  const investmentFee = readSectionObj(root.investmentFee);

  const out = {
    v: 1 as const,
    ach: {
      enabled: clipBool(ach.enabled),
      receivingBank: clipStr(ach.receivingBank),
      bankAddress: clipStr(ach.bankAddress),
      routingNumber: clipStr(ach.routingNumber),
      accountNumber: clipStr(ach.accountNumber),
      accountType: clipAccountType(ach.accountType),
      beneficiaryAccountName: clipStr(ach.beneficiaryAccountName),
      // beneficiaryAddress: clipStr(ach.beneficiaryAddress),
      beneficiaryAddress: "",
      reference: clipStr(ach.reference),
      otherInstructions: clipStr(ach.otherInstructions),
    },
    wire: {
      enabled: clipBool(wire.enabled),
      receivingBank: clipStr(wire.receivingBank),
      bankAddress: clipStr(wire.bankAddress),
      routingNumber: clipStr(wire.routingNumber),
      accountNumber: clipStr(wire.accountNumber),
      accountType: clipAccountType(wire.accountType),
      beneficiaryAccountName: clipStr(wire.beneficiaryAccountName),
      // beneficiaryAddress: clipStr(wire.beneficiaryAddress),
      beneficiaryAddress: "",
      reference: clipStr(wire.reference),
      otherInstructions: clipStr(wire.otherInstructions),
    },
    checks: {
      enabled: clipBool(checks.enabled),
      mailingAddress: clipStr(checks.mailingAddress),
      beneficiary: clipStr(checks.beneficiary),
      // beneficiaryAddress: clipStr(checks.beneficiaryAddress),
      beneficiaryAddress: "",
      memo: clipStr(checks.memo),
      otherInstructions: clipStr(checks.otherInstructions),
    },
    investmentFee: {
      method: clipFeeMethod(investmentFee.method),
      handlingMethod: clipFeeHandling(investmentFee.handlingMethod),
      amount: clipStr(investmentFee.amount),
    },
  };

  const s = JSON.stringify(out);
  if (s.length > MAX_BYTES) {
    throw new FundingInstructionsJsonTooLargeError();
  }
  return s;
}
