import { APP_NAME } from "@/config/app";
import { formatTitle } from "@/utils/title";

export function formatAppDocumentTitle(pageLabel: string): string {
  return formatTitle(pageLabel);
}

export function setAppDocumentTitle(
  pageLabel: string,
  plain = false,
): void {
  const title = pageLabel.trim();

  document.title = plain
    ? title || APP_NAME
    : formatTitle(title);
}

function normalizePath(path: string): string {
  if (path !== "/" && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/metrics": "Platform Metrics",

  "/settings": "Settings",
  "/company": "Settings",

  "/customers": "Customers",

  "/members": "Members",

  "/contacts": "All contacts",
  "/contacts/overview": "Overview",
  "/contacts/crm": "CRM",
  "/contacts/pipeline": "Pipeline",
  "/contacts/inbox": "Inbox",
  "/contacts/campaigns": "Campaigns",
  "/contacts/meetings": "Meetings",
  "/contacts/pages": "Pages & Branding",
  "/contacts/import": "Import",
  "/contacts/investor-view": "Investor view",
  "/contacts/email-templates": "Email Templates",
  "/contacts/email-templates/new": "New email template",

  "/leads": "Leads",

  "/deals": "My deals",
  "/deals/investor-emails": "Investor emails",
  "/deals/reporting": "Reporting",

  "/investing/opportunities": "Opportunities",
  "/investing/investments": "Investments",
  "/investing/documents": "Documents",
  "/investing/profiles": "Profiles",
  "/investing/profiles/add": "Add profile",
  "/investing/company": "Company overview",
  "/investing/cashflows": "Cashflows",
  "/investing/settings": "My account",
  "/account/company": "My account",
  "/account/personal": "My account",
  "/account/password": "My account",
  "/investing/review": "Leave a review",

  "/account": "My account",
  "/refer-a-friend": "Refer a friend",
  "/support": "Support",
  "/notifications": "Notifications",
};

export function pageTitleForAppPathname(
  pathname: string,
  search = "",
): string {
  const path = normalizePath(pathname);

  // Simple exact match
  if (PAGE_TITLES[path]) {
    if (path === "/investing/investments") {
      const tab = new URLSearchParams(search).get("tab");
      if (tab === "deals") return "Deals";
      if (tab === "archives") return "Archives";
    }
    return PAGE_TITLES[path];
  }

  // Deals create/edit
  if (path === "/deals/create") {
    const params = new URLSearchParams(search);
    return params.get("edit") ? "Edit deal" : "Create deal";
  }

  // Dynamic routes
  if (path.match(/^\/customers\/[^/]+\/members$/)) {
    return "Company members";
  }

  if (path.match(/^\/customers\/[^/]+\/deals$/)) {
    return "Company deals";
  }

  if (path.match(/^\/deals\/[^/]+$/)) {
    return "Deal";
  }

  if (path.match(/^\/investing\/investments\/[^/]+$/)) {
    return "Investment";
  }

  if (path.match(/^\/investing\/profiles\/[^/]+\/edit$/)) {
    return "Edit profile";
  }

  if (path.startsWith("/contacts/email-templates/edit/")) {
    return "Edit email template";
  }

  return "SyndicationX";
}