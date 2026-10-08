import type { userInvestorProfiles } from "../../schema/investing.schema/userProfileBook.schema.js";

export type InvestorProfileDistributionBank = {
  distributionMethod: string;
  achRoutingNumber: string;
  achAccountNumber: string;
  achBankAddress: string;
  achBankName: string;
  achBankAccountType: string;
  bankAccountQuery: string;
  checkPayeeName: string;
  checkMailingAddressId: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function strFromSnapshot(s: Record<string, unknown>, key: string): string {
  const v = s[key];
  return typeof v === "string" ? v.trim() : "";
}

function uuidFromSnapshot(s: Record<string, unknown>, key: string): string | null {
  const t = strFromSnapshot(s, key);
  return t && UUID_RE.test(t) ? t : null;
}

export function emptyDistributionBank(): InvestorProfileDistributionBank {
  return {
    distributionMethod: "",
    achRoutingNumber: "",
    achAccountNumber: "",
    achBankAddress: "",
    achBankName: "",
    achBankAccountType: "",
    bankAccountQuery: "",
    checkPayeeName: "",
    checkMailingAddressId: null,
  };
}

/** Read distribution / bank fields from add-profile wizard JSON. */
export function distributionBankFromFormSnapshot(
  snapshot: Record<string, unknown> | null,
): InvestorProfileDistributionBank {
  if (!snapshot) return emptyDistributionBank();
  return {
    distributionMethod: strFromSnapshot(snapshot, "distributionMethod"),
    achRoutingNumber: strFromSnapshot(snapshot, "achRoutingNumber"),
    achAccountNumber: strFromSnapshot(snapshot, "achAccountNumber"),
    achBankAddress: strFromSnapshot(snapshot, "achBankAddress"),
    achBankName: strFromSnapshot(snapshot, "achBankName"),
    achBankAccountType: strFromSnapshot(snapshot, "achBankAccountType"),
    bankAccountQuery: strFromSnapshot(snapshot, "bankAccountQuery"),
    checkPayeeName: strFromSnapshot(snapshot, "checkPayeeName"),
    checkMailingAddressId: uuidFromSnapshot(snapshot, "checkMailingAddressId"),
  };
}

type DistributionDbRow = Pick<
  typeof userInvestorProfiles.$inferSelect,
  | "distributionMethod"
  | "achRoutingNumber"
  | "achAccountNumber"
  | "achBankAddress"
  | "achBankName"
  | "achBankAccountType"
  | "bankAccountQuery"
  | "checkPayeeName"
  | "checkMailingAddressId"
>;

export function distributionBankDbValues(
  bank: InvestorProfileDistributionBank,
): DistributionDbRow {
  return {
    distributionMethod: bank.distributionMethod,
    achRoutingNumber: bank.achRoutingNumber,
    achAccountNumber: bank.achAccountNumber,
    achBankAddress: bank.achBankAddress,
    achBankName: bank.achBankName,
    achBankAccountType: bank.achBankAccountType,
    bankAccountQuery: bank.bankAccountQuery,
    checkPayeeName: bank.checkPayeeName,
    checkMailingAddressId: bank.checkMailingAddressId,
  };
}

export function distributionBankFromDbRow(
  row: DistributionDbRow,
): InvestorProfileDistributionBank {
  return {
    distributionMethod: String(row.distributionMethod ?? "").trim(),
    achRoutingNumber: String(row.achRoutingNumber ?? "").trim(),
    achAccountNumber: String(row.achAccountNumber ?? "").trim(),
    achBankAddress: String(row.achBankAddress ?? "").trim(),
    achBankName: String(row.achBankName ?? "").trim(),
    achBankAccountType: String(row.achBankAccountType ?? "").trim(),
    bankAccountQuery: String(row.bankAccountQuery ?? "").trim(),
    checkPayeeName: String(row.checkPayeeName ?? "").trim(),
    checkMailingAddressId: row.checkMailingAddressId
      ? String(row.checkMailingAddressId).trim()
      : null,
  };
}

/** API / wizard: prefer dedicated columns when set, else keep jsonb values. */
export function mergeDistributionBankIntoWizardState(
  formSnapshot: Record<string, unknown> | null,
  row: DistributionDbRow,
): Record<string, unknown> | null {
  const bank = distributionBankFromDbRow(row);
  const base =
    formSnapshot && typeof formSnapshot === "object" && !Array.isArray(formSnapshot)
      ? { ...formSnapshot }
      : {};

  const apply = (key: keyof InvestorProfileDistributionBank, value: string) => {
    if (value) base[key] = value;
    else if (!(key in base)) base[key] = "";
  };

  apply("distributionMethod", bank.distributionMethod);
  apply("achRoutingNumber", bank.achRoutingNumber);
  apply("achAccountNumber", bank.achAccountNumber);
  apply("achBankAddress", bank.achBankAddress);
  apply("achBankName", bank.achBankName);
  apply("achBankAccountType", bank.achBankAccountType);
  apply("bankAccountQuery", bank.bankAccountQuery);
  apply("checkPayeeName", bank.checkPayeeName);
  if (bank.checkMailingAddressId) {
    base.checkMailingAddressId = bank.checkMailingAddressId;
  } else if (!("checkMailingAddressId" in base)) {
    base.checkMailingAddressId = "";
  }

  return Object.keys(base).length > 0 ? base : null;
}

export type InvestorProfileDistributionBankApi = Omit<
  InvestorProfileDistributionBank,
  "checkMailingAddressId"
> & { checkMailingAddressId: string };

export function distributionBankForApi(
  row: DistributionDbRow,
): InvestorProfileDistributionBankApi {
  const bank = distributionBankFromDbRow(row);
  return {
    ...bank,
    checkMailingAddressId: bank.checkMailingAddressId ?? "",
  };
}
