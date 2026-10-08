import type { InvestorQuestionnaireAnswersMap } from "./investorQuestionnaireAnswers.service.js";
import type { InvestorW9FormData } from "./investorW9Form.service.js";
import type { ProfileBookSnapshot } from "../investing/investingProfileBook.service.js";

type SavedAddress = ProfileBookSnapshot["addresses"][0];

export type EsignAddressPrefillParts = {
  addressLine: string;
  mailingAddressLine: string;
  streetLine: string;
  streetLine2: string;
  city: string;
  state: string;
  zip: string;
  cityStateZip: string;
};

const ADDRESS_QUESTION_IDS = [
  "address",
  "entity_office_address",
  "ira_entity_office_address",
  "relationship_address",
] as const;

function strField(wizard: Record<string, unknown> | null, key: string): string {
  if (!wizard) return "";
  return String(wizard[key] ?? "").trim();
}

function readWizardState(
  profile: ProfileBookSnapshot["profiles"][0],
): Record<string, unknown> | null {
  const raw = profile.profileWizardState;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function resolveAddressById(
  addresses: SavedAddress[],
  id: string,
): SavedAddress | undefined {
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  return addresses.find((a) => a.id === trimmed);
}

function formatAddressLineFromParts(parts: {
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
}): string {
  const street = [parts.street1, parts.street2]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const loc = [parts.city, parts.state, parts.zip]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return [street, loc].filter(Boolean).join(", ");
}

function formatStreetLine(parts: {
  street1: string;
  street2: string;
  addressLine?: string;
}): string {
  const structured = [parts.street1, parts.street2]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  if (structured) return structured;
  const line = String(parts.addressLine ?? "").trim();
  if (!line) return "";
  const comma = line.lastIndexOf(",");
  if (comma > 0) return line.slice(0, comma).trim();
  return line;
}

function formatCityStateZip(parts: {
  city: string;
  state: string;
  zip: string;
  addressLine?: string;
}): string {
  const city = String(parts.city ?? "").trim();
  const state = String(parts.state ?? "").trim();
  const zip = String(parts.zip ?? "").trim();
  if (city && state && zip) return `${city}, ${state} ${zip}`;
  if (city && state) return `${city}, ${state}`;
  const line = String(parts.addressLine ?? "").trim();
  if (!line) return "";
  const comma = line.lastIndexOf(",");
  if (comma > 0) return line.slice(comma + 1).trim();
  return "";
}

export function addressPrefillPartsFromW9(
  w9: InvestorW9FormData | null | undefined,
): EsignAddressPrefillParts | null {
  if (!w9) return null;

  const street1 = String(w9.street1 ?? "").trim();
  const street2 = String(w9.street2 ?? "").trim();
  const city = String(w9.city ?? "").trim();
  const state = String(w9.state ?? "").trim();
  const zip = String(w9.zip ?? "").trim();
  const addressLine =
    String(w9.addressLine ?? "").trim() ||
    formatAddressLineFromParts({ street1, street2, city, state, zip });

  if (!addressLine && !street1 && !city) return null;

  const streetLine = formatStreetLine({ street1, street2, addressLine });
  const cityStateZip = formatCityStateZip({ city, state, zip, addressLine });

  return {
    addressLine,
    mailingAddressLine: addressLine,
    streetLine,
    streetLine2: street2,
    city,
    state,
    zip,
    cityStateZip,
  };
}

export function addressPrefillPartsFromProfileBook(
  profileBook: ProfileBookSnapshot,
  userInvestorProfileId: string,
): EsignAddressPrefillParts | null {
  const profileId = userInvestorProfileId.trim();
  if (!profileId) return null;

  const profile = profileBook.profiles.find((p) => p.id === profileId);
  if (!profile || profile.archived) return null;

  const wizard = readWizardState(profile);
  const taxId = strField(wizard, "taxAddressId");
  const mailingId = strField(wizard, "mailingAddressId");

  const taxAddr =
    resolveAddressById(profileBook.addresses, taxId) ?? profileBook.addresses[0];
  const mailingAddr =
    resolveAddressById(profileBook.addresses, mailingId) ?? taxAddr;

  if (!taxAddr) return null;

  const addressLine = formatAddressLineFromParts(taxAddr);
  const mailingAddressLine = mailingAddr
    ? formatAddressLineFromParts(mailingAddr)
    : addressLine;

  if (!addressLine.trim()) return null;

  return {
    addressLine,
    mailingAddressLine,
    streetLine: formatStreetLine({
      street1: taxAddr.street1,
      street2: taxAddr.street2,
      addressLine,
    }),
    streetLine2: String(taxAddr.street2 ?? "").trim(),
    city: String(taxAddr.city ?? "").trim(),
    state: String(taxAddr.state ?? "").trim(),
    zip: String(taxAddr.zip ?? "").trim(),
    cityStateZip: formatCityStateZip({
      city: taxAddr.city,
      state: taxAddr.state,
      zip: taxAddr.zip,
      addressLine,
    }),
  };
}

export function questionnaireAnswersFromAddressParts(
  parts: EsignAddressPrefillParts,
): InvestorQuestionnaireAnswersMap {
  const out: InvestorQuestionnaireAnswersMap = {};
  for (const id of ADDRESS_QUESTION_IDS) {
    const value =
      id === "relationship_address"
        ? parts.mailingAddressLine || parts.addressLine
        : parts.addressLine;
    if (value.trim()) out[id] = value.trim();
  }

  const mailing = (parts.mailingAddressLine || parts.addressLine).trim();
  if (mailing) out.mailing_address = mailing;
  if (parts.streetLine.trim()) out.street_line = parts.streetLine.trim();
  if (parts.streetLine2.trim()) out.street_line_2 = parts.streetLine2.trim();
  if (parts.city.trim()) out.city = parts.city.trim();
  if (parts.state.trim()) out.state = parts.state.trim();
  if (parts.zip.trim()) out.zip = parts.zip.trim();
  if (parts.cityStateZip.trim()) out.city_state_zip = parts.cityStateZip.trim();

  return out;
}

/** Merge address answers without overwriting non-empty investor entries. */
export function mergeAddressIntoQuestionnaireAnswers(
  current: InvestorQuestionnaireAnswersMap | null | undefined,
  parts: EsignAddressPrefillParts | null,
): InvestorQuestionnaireAnswersMap | null {
  if (!parts) return current ?? null;

  const prefill = questionnaireAnswersFromAddressParts(parts);
  const next: InvestorQuestionnaireAnswersMap = { ...(current ?? {}) };
  for (const [key, value] of Object.entries(prefill)) {
    if (!value.trim()) continue;
    if (!String(next[key] ?? "").trim()) next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : null;
}
