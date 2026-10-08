import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import { getEsignW9PdfPath, esignW9PdfExists } from "../../config/esignW9.config.js";
import { nineDigitsFromSsnItinInput } from "../../common/tax/usSsnItin.js";
import type { InvestorEsignRowTarget } from "./dealMemberEsignStatus.service.js";

const MAX_W9_JSON_CHARS = 16_000;

export type InvestorW9FormData = {
  name: string;
  addressLine: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  /** Up to 9 digits (SSN / ITIN). */
  ssn: string;
};

let cachedW9PageCount: number | null = null;

export async function getEsignW9PageCount(): Promise<number> {
  if (cachedW9PageCount != null) return cachedW9PageCount;
  if (!esignW9PdfExists()) return 0;
  const bytes = await readFile(getEsignW9PdfPath());
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  cachedW9PageCount = doc.getPageCount();
  return cachedW9PageCount;
}

function nineDigitsFromSsn(raw: string): string {
  return nineDigitsFromSsnItinInput(raw);
}

function formatCityStateZip(data: InvestorW9FormData): string {
  const parts = [data.city.trim(), data.state.trim(), data.zip.trim()].filter(
    Boolean,
  );
  if (parts.length >= 2) {
    const zip = data.zip.trim();
    const state = data.state.trim();
    const city = data.city.trim();
    if (city && state && zip) return `${city}, ${state} ${zip}`;
  }
  return parts.join(", ");
}

function formatStreetLine(data: InvestorW9FormData): string {
  const structured = [data.street1.trim(), data.street2.trim()]
    .filter(Boolean)
    .join(", ");
  if (structured) return structured;
  const line = data.addressLine.trim();
  if (!line) return "";
  const comma = line.lastIndexOf(",");
  if (comma > 0) return line.slice(0, comma).trim();
  return line;
}

function resolveCityLine(data: InvestorW9FormData): string {
  const formatted = formatCityStateZip(data);
  if (formatted) return formatted;
  const line = data.addressLine.trim();
  if (!line) return "";
  const comma = line.lastIndexOf(",");
  if (comma > 0) return line.slice(comma + 1).trim();
  return "";
}

function findFieldName(
  names: string[],
  suffix: string,
): string | undefined {
  return names.find((n) => n.includes(suffix));
}

/**
 * Fills IRS fw9.pdf AcroForm fields and flattens so values survive pdf-lib page merge.
 */
export async function buildFilledW9PdfBuffer(
  data: InvestorW9FormData,
): Promise<Buffer> {
  if (!esignW9PdfExists()) {
    throw new Error("W-9 PDF is not configured on the server");
  }
  const w9Bytes = await readFile(getEsignW9PdfPath());
  const doc = await PDFDocument.load(w9Bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const fieldNames = form.getFields().map((f) => f.getName());

  const name = data.name.trim();
  const street = formatStreetLine(data);
  const cityLine = resolveCityLine(data);
  const ssn = nineDigitsFromSsn(data.ssn);

  const setText = (suffix: string, value: string) => {
    if (!value) return;
    const fieldName = findFieldName(fieldNames, suffix);
    if (!fieldName) return;
    try {
      form.getTextField(fieldName).setText(value);
    } catch {
      /* ignore missing / wrong type */
    }
  };

  setText("f1_01[0]", name);
  setText("f1_07[0]", street);
  setText("f1_08[0]", cityLine);
  if (ssn.length === 9) {
    // W-9 SSN is three boxes: area / group / serial — mask all but last 4.
    setText("f1_11[0]", "XXX");
    setText("f1_12[0]", "XX");
    setText("f1_13[0]", ssn.slice(5, 9));
  }

  try {
    form.flatten();
  } catch (err) {
    console.warn("[esign] W-9 flatten failed (continuing):", err);
  }

  return Buffer.from(await doc.save());
}

export function parseInvestorW9FormJson(
  raw: string | null | undefined,
): InvestorW9FormData | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeInvestorW9FormInput(parsed);
  } catch {
    return null;
  }
}

export function normalizeInvestorW9FormInput(
  raw: unknown,
): InvestorW9FormData | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    return parseInvestorW9FormJson(t);
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const str = (camel: string, snake: string) =>
    String(o[camel] ?? o[snake] ?? "").trim();

  const data: InvestorW9FormData = {
    name: str("name", "name"),
    addressLine: str("addressLine", "address_line"),
    street1: str("street1", "street1"),
    street2: str("street2", "street2"),
    city: str("city", "city"),
    state: str("state", "state"),
    zip: str("zip", "zip"),
    ssn: nineDigitsFromSsn(str("ssn", "ssn")),
  };

  if (!data.name) return null;
  const hasAddress =
    Boolean(data.addressLine) ||
    Boolean(data.street1 && data.city && data.state && data.zip);
  if (!hasAddress) return null;
  if (data.ssn.length !== 9) return null;

  return data;
}

export function serializeInvestorW9Form(
  data: InvestorW9FormData | null | undefined,
): string | null {
  if (!data) return null;
  const json = JSON.stringify(data);
  if (json.length > MAX_W9_JSON_CHARS) {
    throw new Error("W-9 form data is too large to save");
  }
  return json;
}

export async function readInvestorW9FormForTarget(
  dealId: string,
  target: InvestorEsignRowTarget,
): Promise<InvestorW9FormData | null> {
  if (target.table !== "investment") return null;

  const [row] = await db
    .select({ json: dealInvestment.investorW9FormJson })
    .from(dealInvestment)
    .where(
      and(
        eq(dealInvestment.id, target.id),
        eq(dealInvestment.dealId, dealId),
      ),
    )
    .limit(1);
  return parseInvestorW9FormJson(row?.json);
}
