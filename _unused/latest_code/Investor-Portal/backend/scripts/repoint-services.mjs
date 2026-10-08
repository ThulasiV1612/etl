/**
 * One-off: after moving files under src/services/<domain>/, fix imports.
 * Run from backend/: node scripts/repoint-services.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(__dirname, "../src")

const SERVICE_TO_DIR = {
  "assigningDealUser.service.js": "deal",
  "dealAccess.service.js": "deal",
  "dealForm.service.js": "deal",
  "dealInvestment.service.js": "deal",
  "dealInvestorClass.service.js": "deal",
  "dealListRowEnrichment.service.js": "deal",
  "dealLpInvestmentCapitalRaisingGuard.service.js": "deal",
  "dealLpInvestor.service.js": "deal",
  "dealLpInvestorMyInvestNowCommitment.addon.service.js": "deal",
  "dealMember.service.js": "deal",
  "dealMemberInvitationEmail.service.js": "deal",
  "dealMemberInviteToken.service.js": "deal",
  "dealMemberScope.service.js": "deal",
  "dealParticipantProfile.service.js": "deal",
  "offeringPreviewCapitalRaisingGuards.service.js": "deal",
  "offeringPreviewShareEmail.service.js": "deal",
  "offeringShareRecipientDirectory.service.js": "deal",
  "signupPrefillDeal.service.js": "deal",
  "sponsorTotalInvestment.service.js": "deal",
  "cloudinaryCompanyBranding.service.js": "company",
  "company.service.js": "company",
  "companyWorkspaceSettings.service.js": "company",
  "account.service.js": "auth",
  "auth.service.js": "auth",
  "invite.service.js": "auth",
  "inviteEmail.service.js": "auth",
  "invitePendingUser.service.js": "auth",
  "passwordReset.service.js": "auth",
  "signup.service.js": "auth",
  "contact.service.js": "contact",
  "contactExportNotify.service.js": "contact",
  "organizationContactLabels.service.js": "contact",
  "investingProfileBook.service.js": "investing",
  "lpInvestorAccess.service.js": "investing",
  "userAdmin.service.js": "user",
  "userMemberships.service.js": "user",
  "exportNotifySanitize.js": "workspace",
  "workspaceExportAudit.service.js": "workspace",
  "orgResolution.service.js": "org",
}

function walkTs(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walkTs(p, out)
    else if (ent.name.endsWith(".ts")) out.push(p)
  }
  return out
}

function repointServiceConsumers(content) {
  let s = content
  for (const [file, dir] of Object.entries(SERVICE_TO_DIR)) {
    const needle = `services/${file}`
    const repl = `services/${dir}/${file}`
    if (s.includes(needle)) s = s.split(needle).join(repl)
  }
  return s
}

function deepenSrcImports(content) {
  let s = content
  const pairs = [
    ['from "../database/', 'from "../../database/'],
    ['from "../schema/', 'from "../../schema/'],
    ['from "../config/', 'from "../../config/'],
    ['from "../utils/', 'from "../../utils/'],
    ['from "../functions/', 'from "../../functions/'],
    ['from "../constants/', 'from "../../constants/'],
  ]
  for (const [a, b] of pairs) {
    if (s.includes(a)) s = s.split(a).join(b)
  }
  return s
}

const servicesSubdirs = path.join(srcRoot, "services")
let n = 0
for (const f of walkTs(servicesSubdirs)) {
  if (f === path.join(servicesSubdirs, "index.ts")) continue
  const rel = path.relative(servicesSubdirs, f)
  if (!rel.includes(path.sep)) continue
  let s = fs.readFileSync(f, "utf8")
  const o = s
  s = deepenSrcImports(s)
  if (s !== o) {
    fs.writeFileSync(f, s, "utf8")
    n++
  }
}
console.log("Deepened src-relative imports in", n, "service files")

let m = 0
for (const f of walkTs(srcRoot)) {
  if (f.startsWith(servicesSubdirs + path.sep)) continue
  let s = fs.readFileSync(f, "utf8")
  const o = s
  s = repointServiceConsumers(s)
  if (s !== o) {
    fs.writeFileSync(f, s, "utf8")
    m++
  }
}
console.log("Updated service import paths in", m, "files under src/")
