import fs from "node:fs"
import path from "node:path"

const srcRoot = path.resolve("src")

function walkTs(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walkTs(p, out)
    else if (/\.tsx?$/.test(ent.name)) out.push(p)
  }
  return out
}

function relToSrc(file) {
  return path.relative(srcRoot, file).replace(/\\/g, "/")
}

const files = walkTs(srcRoot)
let changed = 0

for (const file of files) {
  let s = fs.readFileSync(file, "utf8")
  const orig = s

  s = s.replaceAll(
    "./modules/Syndication/InvestorPortal/Dashboard/",
    "./modules/Syndication/Dashboard/",
  )
  s = s.replaceAll(
    "./modules/Syndication/InvestorPortal/Deals/",
    "./modules/Syndication/Deals/",
  )
  s = s.replaceAll(
    "./modules/Syndication/InvestorPortal/InvestorEmails/",
    "./modules/Syndication/InvestorEmails/",
  )
  s = s.replaceAll(
    "./modules/Syndication/InvestorPortal/Reporting/",
    "./modules/Syndication/Reporting/",
  )
  s = s.replaceAll("./modules/company/", "./modules/Syndication/company/")
  s = s.replaceAll(
    "./modules/usermanagement/",
    "./modules/Syndication/usermanagement/",
  )
  s = s.replaceAll("./modules/contacts/", "./modules/Syndication/contacts/")
  s = s.replaceAll(
    "@/modules/Investing/deals_investing",
    "@/modules/Investing/pages/deals/deals_investing",
  )
  s = s.replaceAll(
    "Deals/tabs/deal_create/CreateDealPage",
    "Deals/deal_create/CreateDealPage",
  )
  s = s.replaceAll("@/modules/company/companyBranding", "@/modules/Syndication/company/companyBranding")

  s = s.replaceAll(
    "@/modules/Syndication/InvestorPortal/Deals/",
    "@/modules/Syndication/Deals/",
  )
  s = s.replaceAll(
    "@/modules/Syndication/InvestorPortal/dealsDashboardUtils",
    "@/modules/Syndication/dealsDashboardUtils",
  )
  s = s.replaceAll(
    "modules/Syndication/InvestorPortal/Deals/",
    "modules/Syndication/Deals/",
  )

  const r = relToSrc(file)

  // Syndication/company, contacts (root), usermanagement: ../../common -> ../../../common
  if (
    r.startsWith("modules/Syndication/company/") ||
    r === "modules/Syndication/contacts/ContactsPage.tsx" ||
    r === "modules/Syndication/contacts/EmailTemplatesPage.tsx" ||
    r === "modules/Syndication/contacts/EmailTemplateNewPage.tsx" ||
    r.startsWith("modules/Syndication/usermanagement/")
  ) {
    s = s.replaceAll('from "../../common/', 'from "../../../common/')
    s = s.replaceAll("from '../../common/", "from '../../../common/")
  }

  // Deals/*.tsx|ts at package root (not api/, tabs/, etc.)
  if (/^modules\/Syndication\/Deals\/[^/]+\.(tsx|ts)$/.test(r)) {
    s = s.replaceAll('from "../../../../common/', 'from "../../../common/')
    s = s.replaceAll("from '../../../../common/", "from '../../../common/")
  }

  // Deals/api, components, utils, types, deal_create: one extra ../ to common
  if (
    /^modules\/Syndication\/Deals\/(api|components|utils|types|deal_create)\//.test(
      r,
    )
  ) {
    s = s.replaceAll(
      'from "../../../../../common/',
      'from "../../../../common/',
    )
    s = s.replaceAll(
      "from '../../../../../common/",
      "from '../../../../common/",
    )
  }

  // Dashboard
  if (r === "modules/Syndication/Dashboard/SponsorDashboardPage.tsx") {
    s = s.replaceAll('from "../../../../common/', 'from "../../../common/')
    s = s.replaceAll("from '../../../../common/", "from '../../../common/")
    s = s.replaceAll(
      "@/modules/Investing/dashboard_investing",
      "@/modules/Investing/pages/dashboard",
    )
    s = s.replaceAll(
      'import "../../../usermanagement/',
      'import "../usermanagement/',
    )
  }

  if (r === "modules/Syndication/Dashboard/syndicationDashboardData.ts") {
    s = s.replaceAll(
      'from "../../../contacts/api/contactsApi"',
      'from "../contacts/api/contactsApi"',
    )
  }

  if (r === "modules/Syndication/dealsDashboardUtils.ts") {
    s = s.replaceAll('from "../../../common/', 'from "../../common/')
    s = s.replaceAll("from '../../../common/", "from '../../common/")
  }

  if (r === "modules/Syndication/Deals/utils/dealInvestorExportCsv.ts") {
    s = s.replaceAll(
      'from "../../../usermanagement/memberAdminShared"',
      'from "../../usermanagement/memberAdminShared"',
    )
  }

  if (r === "modules/Syndication/company/CompanyDealsPage.tsx") {
    s = s.replaceAll(
      "from '../Syndication/InvestorPortal/Deals/",
      "from '../Deals/",
    )
  }

  if (r === "modules/Syndication/company/CompanyMembersPage.tsx") {
    s = s.replaceAll(
      'from "../auth/utils/decode-jwt-payload"',
      'from "../../auth/utils/decode-jwt-payload"',
    )
  }

  if (r === "modules/Syndication/usermanagement/UserManagementPage.tsx") {
    s = s.replaceAll(
      'from "../auth/utils/decode-jwt-payload"',
      'from "../../auth/utils/decode-jwt-payload"',
    )
  }

  if (r === "modules/Syndication/contacts/components/AddContactPanel.tsx") {
    s = s.replaceAll(
      'from "../../myaccount/accountApi"',
      'from "../../../myaccount/accountApi"',
    )
    s = s.replaceAll(
      'from "../../../common/auth/sessionUserDisplayName"',
      'from "../../../../common/auth/sessionUserDisplayName"',
    )
  }

  if (r === "modules/Syndication/contacts/components/ViewContactModal.tsx") {
    s = s.replaceAll(
      'from "../../../common/components/ViewReadonlyField"',
      'from "../../../../common/components/ViewReadonlyField"',
    )
  }

  if (r === "common/hooks/useSessionRoleDisplayLabel.ts") {
    s = s.replaceAll(
      'from "../../modules/usermanagement/memberAdminShared"',
      'from "../../modules/Syndication/usermanagement/memberAdminShared"',
    )
  }

  if (r === "modules/myaccount/MyAccountCompanyPage.tsx") {
    s = s.replaceAll(
      'from "../usermanagement/memberAdminShared"',
      'from "../Syndication/usermanagement/memberAdminShared"',
    )
  }

  if (r === "modules/Syndication/Deals/DealsListPage.tsx") {
    s = s.replaceAll(
      'from "./components/DealInvestorRoleBadge"',
      'from "./tabs/investors/DealInvestorRoleBadge"',
    )
  }

  if (r === "modules/Syndication/Deals/components/DealPreviewModal.tsx") {
    s = s.replaceAll(
      'from "./DealInvestorRoleBadge"',
      'from "../tabs/investors/DealInvestorRoleBadge"',
    )
  }

  if (r === "modules/Syndication/Deals/DealDetailPage.tsx") {
    s = s.replaceAll(
      "@/modules/Investing/deal-details",
      "@/modules/Investing/pages/deals/deal-details",
    )
    s = s.replaceAll(
      'import "../../../usermanagement/',
      'import "../usermanagement/',
    )
  }

  if (s !== orig) {
    fs.writeFileSync(file, s, "utf8")
    changed++
  }
}

console.log("Updated", changed, "files")
