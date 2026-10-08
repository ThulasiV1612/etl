/**
 * Maps HTTP path + method → stable semantic event keys for SOC / SIEM (dot.case).
 * Paths use normalizeAuditPath() so UUIDs become :id before matching.
 */

/** Replace UUID segments so one template matches many requests. */
export function normalizeAuditPath(pathOnly: string): string {
  return pathOnly.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi,
    "/:id",
  );
}

/** Path segments after /api/v1 (leading slash stripped). */
function apiSegments(normalizedFullPath: string): string[] {
  const tail = normalizedFullPath.replace(/^\/api\/v1\/?/i, "");
  return tail.split("/").filter(Boolean);
}

export function deriveAuditModule(pathOnly: string): string {
  const parts = pathOnly.split("/").filter(Boolean);
  if (parts[0] === "api" && parts[1] === "v1" && parts[2])
    return `api-${parts[2]}`;
  return "api";
}

function fallbackHttpEvent(normalizedPath: string, method: string): string {
  const slug =
    normalizedPath
      .replace(/^\//, "")
      .replace(/\//g, ".") || "request";
  return `http.${method.toLowerCase()}.${slug}`;
}

/**
 * Ordered checks: most specific routes first, then generic resource patterns.
 */
export function deriveSemanticAuditEvent(pathOnly: string, method: string): string {
  const n = normalizeAuditPath(pathOnly);
  const m = method.toUpperCase();
  const s = apiSegments(n);

  // --- Auth & session ---
  if (m === "POST" && n.endsWith("/auth/signin")) return "auth.signin";
  if (m === "POST" && /\/auth\/signup/.test(n)) return "auth.signup";
  if (m === "POST" && n.includes("/auth/forgot-password")) return "auth.forgot_password";
  if (m === "POST" && n.includes("/auth/reset-password")) return "auth.reset_password";
  if (m === "POST" && n.includes("/auth/change-password")) return "auth.change_password";
  if (m === "POST" && n.includes("/auth/invite")) return "auth.invite";
  if ((m === "GET" || m === "PATCH" || m === "POST") && /\/auth\/me\b/.test(n))
    return "auth.me";
  if (m === "GET" && n.includes("/auth/deal-invite/verify")) return "auth.deal_invite_verify";
  if (m === "GET" && n.includes("/auth/signup/prefill")) return "auth.signup_prefill";

  // --- Company (org / workspace / branding context) ---
  if (s[0] === "public" && s[1] === "company-branding" && s[2] && m === "GET")
    return "company.public_branding";
  if (s[0] === "companies" && s.length === 1 && m === "GET") return "company.list";
  if (s[0] === "companies" && s.length === 1 && m === "POST") return "company.create";
  if (s[0] === "companies" && s[1] === "export-notify" && m === "POST")
    return "company.export_notify";
  if (s[0] === "companies" && s[2] === "workspace-settings" && s[3] && m === "GET")
    return "company.workspace_settings_read";
  if (s[0] === "companies" && s[2] === "workspace-settings" && s[3] && m === "PUT")
    return "company.workspace_settings_update";
  if (s[0] === "companies" && s[1] === ":id" && s.length === 2 && m === "PATCH")
    return "company.update";

  // --- Contacts ---
  if (s[0] === "contacts" && s.length === 1 && m === "GET") return "contact.list";
  if (s[0] === "contacts" && s[1] === "organization-tags" && m === "GET")
    return "contact.organization_tags";
  if (s[0] === "contacts" && s[1] === "organization-lists" && m === "GET")
    return "contact.organization_lists";
  if (s[0] === "contacts" && s.length === 1 && m === "POST") return "contact.create";
  if (s[0] === "contacts" && s[1] === "export-notify" && m === "POST")
    return "contact.export_notify";
  if (s[0] === "contacts" && s[1] === ":id" && s[2] === "status" && m === "PATCH")
    return "contact.status_update";
  if (s[0] === "contacts" && s[1] === ":id" && s.length === 2 && m === "PATCH")
    return "contact.update";

  // --- User admin & sponsor add-on ---
  if (s[0] === "users" && s[1] === "sponsor-total-investments" && m === "GET")
    return "user.sponsor_total_investments";
  if (s[0] === "users" && s.length === 1 && m === "GET") return "user_admin.list";
  if (s[0] === "users" && s[1] === "export-notify" && m === "POST")
    return "user_admin.export_notify";
  if (s[0] === "users" && s[1] === ":id" && s[2] === "audit-logs" && m === "GET")
    return "user_admin.member_audit_logs";
  if (s[0] === "users" && s[1] === ":id" && s.length === 2 && m === "PATCH")
    return "user_admin.update";

  // --- Investing profile book (post-sign-in account data) ---
  if (s[0] === "investing" && s[1] === "my-profile-book" && s.length === 2 && m === "GET")
    return "investing.profile_book_read";
  if (
    s[0] === "investing" &&
    s[1] === "my-profile-book" &&
    s[2] === "profiles" &&
    s.length === 3 &&
    m === "POST"
  )
    return "investing.profile_create";
  if (
    s[0] === "investing" &&
    s[1] === "my-profile-book" &&
    s[2] === "profiles" &&
    s[3] === ":id" &&
    (m === "PATCH" || m === "PUT")
  )
    return m === "PATCH" ? "investing.profile_patch" : "investing.profile_replace";
  if (
    s[0] === "investing" &&
    s[1] === "my-profile-book" &&
    s[2] === "beneficiaries" &&
    s.length === 3 &&
    m === "POST"
  )
    return "investing.beneficiary_create";
  if (
    s[0] === "investing" &&
    s[1] === "my-profile-book" &&
    s[2] === "beneficiaries" &&
    s[3] === ":id" &&
    (m === "PATCH" || m === "PUT")
  )
    return m === "PATCH"
      ? "investing.beneficiary_patch"
      : "investing.beneficiary_replace";
  if (
    s[0] === "investing" &&
    s[1] === "my-profile-book" &&
    s[2] === "addresses" &&
    s.length === 3 &&
    m === "POST"
  )
    return "investing.address_create";
  if (
    s[0] === "investing" &&
    s[1] === "my-profile-book" &&
    s[2] === "addresses" &&
    s[3] === ":id" &&
    (m === "PATCH" || m === "PUT")
  )
    return m === "PATCH" ? "investing.address_patch" : "investing.address_replace";

  // --- Deals (public preview lives under /public, not /deals/public) ---
  if (s[0] === "public" && s[1] === "offering-preview" && m === "GET")
    return "deal.public_offering_preview";

  // --- Deals (nested paths before generic /deals/:id) ---
  if (s[0] === "deals" && s.length === 1 && m === "GET") return "deal.list";
  if (s[0] === "deals" && s[1] === "export-notify" && m === "POST")
    return "deal.export_notify";

  if (s[0] === "deals" && s[1] === ":id") {
    const rest = s.slice(2);
    if (rest[0] === "investor-classes" && rest.length === 1 && m === "GET")
      return "deal.investor_classes_list";
    if (rest[0] === "investor-classes" && rest.length === 1 && m === "POST")
      return "deal.investor_class_create";
    if (rest[0] === "investor-classes" && rest[1] === ":id" && rest.length === 2 && m === "PUT")
      return "deal.investor_class_replace";
    if (rest[0] === "investor-classes" && rest[1] === ":id" && rest.length === 2 && m === "DELETE")
      return "deal.investor_class_delete";
    if (rest[0] === "investors" && rest.length === 1 && m === "GET") return "deal.investors_list";
    if (rest[0] === "commitment-amount" && rest.length === 1 && m === "GET")
      return "deal.commitment_amount";
    if (rest[0] === "investors" && rest[1] === "export-notify" && m === "POST")
      return "deal.investors_export_notify";
    if (rest[0] === "lp-investors" && rest.length === 1 && m === "POST")
      return "deal.lp_investor_create";
    if (rest[0] === "lp-investors" && rest[1] === ":id" && rest.length === 2 && m === "PUT")
      return "deal.lp_investor_replace";
    if (rest[0] === "lp-investors" && rest[1] === "my-commitment" && m === "PATCH")
      return "deal.lp_investor_my_commitment";
    if (
      rest[0] === "lp-investors" &&
      rest[1] === "my-invest-now-commitment" &&
      m === "PATCH"
    )
      return "deal.lp_investor_my_invest_now";
    if (rest[0] === "members" && rest.length === 1 && m === "GET") return "deal.members_list";
    if (rest[0] === "members" && rest[1] === "export-notify" && m === "POST")
      return "deal.members_export_notify";
    if (rest[0] === "members" && rest.length === 2 && m === "DELETE")
      return "deal.member_remove";
    if (rest[0] === "members" && rest[1] === "send-invitation-email" && m === "POST")
      return "deal.member_invitation_email";
    if (rest[0] === "members" && rest[1] === "send-esign" && m === "POST")
      return "deal.member_send_esign";
    if (rest[0] === "investments" && rest.length === 1 && m === "POST")
      return "deal.investment_create";
    if (rest[0] === "investments" && rest[1] === ":id" && rest.length === 2 && m === "PUT")
      return "deal.investment_replace";
    if (rest[0] === "investor-summary" && m === "PATCH") return "deal.investor_summary_patch";
    if (rest[0] === "deal-announcement" && m === "PATCH") return "deal.announcement_patch";
    if (rest[0] === "key-highlights" && m === "PATCH") return "deal.key_highlights_patch";
    if (rest[0] === "funding-instructions" && m === "PATCH")
      return "deal.funding_instructions_patch";
    if (rest[0] === "offering-investor-preview" && m === "PATCH")
      return "deal.offering_investor_preview_patch";
    if (rest[0] === "gallery-cover" && m === "PATCH") return "deal.gallery_cover_patch";
    if (rest[0] === "offering-gallery-uploads" && m === "POST")
      return "deal.offering_gallery_upload";
    if (rest[0] === "offering-document-uploads" && m === "POST")
      return "deal.offering_document_upload";
    if (rest[0] === "offering-gallery" && m === "PATCH") return "deal.offering_gallery_patch";
    if (rest[0] === "offering-overview" && m === "PATCH") return "deal.offering_overview_patch";
    if (rest[0] === "offering-preview-token" && m === "GET")
      return "deal.offering_preview_token";
    if (rest[0] === "offering-preview-share-email" && m === "POST")
      return "deal.offering_preview_share_email";
    if (rest[0] === "offering-share-recipients" && m === "GET")
      return "deal.offering_share_recipients";
    if (rest.length === 0 && m === "GET") return "deal.read";
    if (rest.length === 0 && m === "PUT") return "deal.replace";
    if (rest.length === 0 && m === "DELETE") return "deal.delete";
  }

  if (s[0] === "deals" && s.length === 1 && m === "POST") return "deal.create";

  // --- Multipart branding (same path pattern as company route on server) ---
  if (
    s[0] === "companies" &&
    s[2] === "settings" &&
    s[3] === "branding" &&
    s[4] &&
    m === "POST"
  )
    return "company.branding_upload";

  return fallbackHttpEvent(n, method);
}
