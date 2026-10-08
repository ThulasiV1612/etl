/** Plain-text deal announcement fields for `add_deal_form` columns. */

const MAX_TITLE_LEN = 500;
const MAX_MESSAGE_LEN = 12_000;

function stripControls(s: string, allowNewlines: boolean): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0x9) {
      out += " ";
      continue;
    }
    if (c === 0xa || c === 0xd) {
      if (allowNewlines) out += ch;
      continue;
    }
    if (c < 0x20) continue;
    if (c === 0x7f) continue;
    out += ch;
  }
  return out;
}

export type SanitizedDealAnnouncement = {
  title: string | null;
  message: string | null;
};

export function sanitizeDealAnnouncement(input: {
  title: string;
  message: string;
}): SanitizedDealAnnouncement {
  const rawTitle = typeof input.title === "string" ? input.title : "";
  const rawMessage = typeof input.message === "string" ? input.message : "";
  const titleLine = stripControls(
    rawTitle.replace(/\r\n|\r|\n/g, " ").trim(),
    false,
  ).slice(0, MAX_TITLE_LEN);
  const messageBlock = stripControls(rawMessage.trim(), true).slice(
    0,
    MAX_MESSAGE_LEN,
  );
  return {
    title: titleLine === "" ? null : titleLine,
    message: messageBlock === "" ? null : messageBlock,
  };
}
