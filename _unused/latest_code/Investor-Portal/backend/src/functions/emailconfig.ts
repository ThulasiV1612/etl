import nodemailer from "nodemailer";

/**
 * Nodemailer transporter from env:
 * - EMAIL_SERVICE_TYPE: `gmail` | `office365` | `smtp`
 * - For gmail / office365: SENDER_EMAIL_ID, SENDER_EMAIL_PASSWORD
 * - For smtp: SMTP_HOST (required), SMTP_PORT (default 587), SMTP_SECURE (true|false),
 *   optional SENDER_EMAIL_ID + SENDER_EMAIL_PASSWORD if the server requires auth
 *
 * Optional global envelope — spread {@link outgoingMailCcBcc} into each `sendMail` so CC/BCC
 * are always applied explicitly (invite, password reset, export audit, etc.):
 * - EMAIL_CC / CC_EMAIL: comma- or semicolon-separated, JSON array, or bracketed quoted list
 * - EMAIL_BCC / BCC_EMAIL: same (both vars are merged for BCC)
 */

function dedupeEmails(addrs: string[]): string[] {
  return [...new Set(addrs)];
}

/**
 * Parse env value as a list of emails: `a@x.com,b@y.com`, JSON `["a@x.com","b@y.com"]`, or
 * Python-style `['a@x.com','b@y.com']` (single-quoted inside brackets).
 */
function parseAddressListFromRaw(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  const t = raw.trim();

  if (t.startsWith("[") && t.endsWith("]")) {
    try {
      const arr = JSON.parse(t) as unknown;
      if (Array.isArray(arr)) {
        return dedupeEmails(
          arr
            .map((x) => String(x).trim().toLowerCase())
            .filter((x) => x.includes("@")),
        );
      }
    } catch {
      /* e.g. single-quoted list */
    }
    const inner = t.slice(1, -1).trim();
    const quoted: string[] = [];
    const re = /'([^']*)'|"([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner)) !== null) {
      const addr = (m[1] ?? m[2]).trim().toLowerCase();
      if (addr.includes("@")) quoted.push(addr);
    }
    if (quoted.length > 0) return dedupeEmails(quoted);

    return dedupeEmails(
      inner
        .split(/[,;]/)
        .map((p) => p.replace(/^['"]+|['"]+$/g, "").trim().toLowerCase())
        .filter((x) => x.includes("@")),
    );
  }

  return dedupeEmails(
    t
      .split(/[,;]/)
      .map((p) => p.replace(/^['"]+|['"]+$/g, "").trim().toLowerCase())
      .filter((x) => x.includes("@")),
  );
}

/** Single address or list for nodemailer `cc` / `bcc`. */
function listForNodemailer(addresses: string[]): string | string[] | undefined {
  if (addresses.length === 0) return undefined;
  if (addresses.length === 1) return addresses[0];
  return addresses;
}

/** CC recipients from `EMAIL_CC` and optional `CC_EMAIL` (merged, deduped). */
export function getEmailCcFromEnv(): string | string[] | undefined {
  const merged = dedupeEmails([
    ...parseAddressListFromRaw(process.env.EMAIL_CC),
    ...parseAddressListFromRaw(process.env.CC_EMAIL),
  ]);
  return listForNodemailer(merged);
}

/** BCC recipients from `EMAIL_BCC` and optional `BCC_EMAIL` (merged, deduped). */
export function getEmailBccFromEnv(): string | string[] | undefined {
  const merged = dedupeEmails([
    ...parseAddressListFromRaw(process.env.EMAIL_BCC),
    ...parseAddressListFromRaw(process.env.BCC_EMAIL),
  ]);
  return listForNodemailer(merged);
}

/**
 * Fields to spread into `transporter.sendMail({ ... })` so all outbound mail
 * includes configured CC/BCC (e.g. archival or internal visibility).
 */
export function outgoingMailCcBcc(): {
  cc?: string | string[];
  bcc?: string | string[];
} {
  const cc = getEmailCcFromEnv();
  const bcc = getEmailBccFromEnv();
  return {
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
  };
}

/**
 * Explicit SMTP envelope so every recipient gets a RCPT TO (some providers, e.g. Gmail SMTP,
 * are unreliable when BCC is only implied from MIME). Mirrors nodemailer's envelope merge.
 */
export function smtpEnvelopeForSendMail(opts: {
  fromAddress: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
}): { from: string; to?: string; cc?: string; bcc?: string } {
  const from = opts.fromAddress.trim();
  const fmt = (v: string | string[] | undefined): string | undefined => {
    if (v == null) return undefined;
    const s = Array.isArray(v) ? v.join(", ") : v;
    const t = s.trim();
    return t.length > 0 ? t : undefined;
  };
  return {
    from,
    to: fmt(opts.to),
    cc: fmt(opts.cc),
    bcc: fmt(opts.bcc),
  };
}

const emailConfig = () => {
  const EMAIL_SERVICE = process.env.EMAIL_SERVICE_TYPE?.trim().toLowerCase();
  const user = process.env.SENDER_EMAIL_ID?.trim();
  const pass = process.env.SENDER_EMAIL_PASSWORD?.trim();

  if (EMAIL_SERVICE === "smtp") {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) {
      throw new Error(
        "When EMAIL_SERVICE_TYPE=smtp, SMTP_HOST must be set (e.g. smtp.sendgrid.net).",
      );
    }
    const portRaw = process.env.SMTP_PORT?.trim();
    const port = portRaw ? Number.parseInt(portRaw, 10) : 587;
    const secure = process.env.SMTP_SECURE?.trim().toLowerCase() === "true";
    return nodemailer.createTransport({
      host,
      port: Number.isFinite(port) ? port : 587,
      secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  if (!user || !pass) {
    throw new Error(
      "SENDER_EMAIL_ID and SENDER_EMAIL_PASSWORD must be set to send email (or use EMAIL_SERVICE_TYPE=smtp with SMTP_HOST and optional auth).",
    );
  }

  if (EMAIL_SERVICE === "gmail") {
    return nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user, pass },
    });
  }

  if (EMAIL_SERVICE === "office365") {
    return nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: { user, pass },
    });
  }

  throw new Error(
    "Unsupported EMAIL_SERVICE_TYPE. Use 'gmail', 'office365', or 'smtp'.",
  );
};

export default emailConfig;
