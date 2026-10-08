/** Validates and normalizes Key Highlights JSON for `add_deal_form.key_highlights_json`. */

export class KeyHighlightsJsonInvalidError extends Error {
  constructor(message = "Invalid key highlights payload") {
    super(message);
    this.name = "KeyHighlightsJsonInvalidError";
  }
}

export class KeyHighlightsJsonTooLargeError extends Error {
  constructor() {
    super("Key highlights payload is too large");
    this.name = "KeyHighlightsJsonTooLargeError";
  }
}

const MAX_BYTES = 100_000;
const MAX_ROWS = 100;
const MAX_FIELD_LEN = 2000;
const MAX_ID_LEN = 128;

export function sanitizeKeyHighlightsJson(raw: string): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (t === "") {
    return JSON.stringify([]);
  }
  if (t.length > MAX_BYTES) {
    throw new KeyHighlightsJsonTooLargeError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    throw new KeyHighlightsJsonInvalidError("Invalid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new KeyHighlightsJsonInvalidError("Expected a JSON array");
  }
  if (parsed.length > MAX_ROWS) {
    throw new KeyHighlightsJsonInvalidError("Too many rows");
  }
  const out: {
    id: string;
    metric: string;
    newClass: string;
    isPreset: boolean;
  }[] = [];
  for (const item of parsed) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      throw new KeyHighlightsJsonInvalidError();
    }
    const o = item as Record<string, unknown>;
    const id =
      typeof o.id === "string" ? o.id.trim().slice(0, MAX_ID_LEN) : "";
    const metric =
      typeof o.metric === "string"
        ? o.metric.slice(0, MAX_FIELD_LEN)
        : "";
    const newClass =
      typeof o.newClass === "string"
        ? o.newClass.slice(0, MAX_FIELD_LEN)
        : "";
    const isPreset = o.isPreset === true;
    if (!id) {
      throw new KeyHighlightsJsonInvalidError("Row missing id");
    }
    out.push({ id, metric, newClass, isPreset });
  }
  const s = JSON.stringify(out);
  if (s.length > MAX_BYTES) {
    throw new KeyHighlightsJsonTooLargeError();
  }
  return s;
}
