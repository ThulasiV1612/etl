import { buildDealMemberInviteLandingUrl } from "./dealMemberInviteToken.service.js";

function frontendOrigin(): string {
  const raw =
    process.env.FRONTEND_URL?.trim() || process.env.BASE_URL?.trim() || "";
  return raw.replace(/\/$/, "");
}

function esignPathForDeal(dealId: string): string {
  return `/investing/investments/${encodeURIComponent(dealId.trim())}/esign`;
}

/**
 * Public entry for eSign emails: deal-invite token (no login yet) + `next` to the sign page.
 * Falls back to the sign path on the portal origin when invite tokens are unavailable.
 */
export async function buildDealInvestorEsignSignPageUrl(
  dealId: string,
  toEmail: string,
): Promise<string> {
  const origin = frontendOrigin();
  const id = dealId.trim();
  const email = toEmail.trim().toLowerCase();
  if (!id) return "";

  const nextPath = esignPathForDeal(id);
  const inviteUrl =
    email && email.includes("@")
      ? await buildDealMemberInviteLandingUrl(id, email)
      : "";

  if (inviteUrl.includes("deal-invite?token=")) {
    const sep = inviteUrl.includes("?") ? "&" : "?";
    return `${inviteUrl}${sep}next=${encodeURIComponent(nextPath)}`;
  }

  if (!origin) return "";
  // Never put the protected eSign path in email — always sign-in or deal-invite with `next`.
  return `${origin}/signin?next=${encodeURIComponent(nextPath)}`;
}
