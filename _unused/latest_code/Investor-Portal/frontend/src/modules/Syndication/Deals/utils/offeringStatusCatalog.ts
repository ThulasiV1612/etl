import type { LucideIcon } from "lucide-react"
import {
  Archive,
  CircleDollarSign,
  Clock,
  EyeOff,
  HandCoins,
  Handshake,
  Lock,
  ShieldCheck,
} from "lucide-react"
import type { DealStatus } from "../constants/deal-lifecycle"

export type OfferingStatusTone =
  | "slate"
  | "amber"
  | "blue"
  | "violet"
  | "green"
  | "orange"
  | "red"
  | "charcoal"

export interface OfferingStatusMeta {
  value: DealStatus
  /** Short label in the closed trigger and list title. */
  label: string
  tone: OfferingStatusTone
  icon: LucideIcon
  description: string
  investorAccess: string
  sponsorGuide: string
}

export const OFFERING_STATUS_CATALOG: Record<DealStatus, OfferingStatusMeta> = {
  draft_hidden: {
    value: "draft_hidden",
    label: "Draft",
    // label: "Draft (hidden to investors)",
    tone: "slate",
    icon: EyeOff,
    description:
      "The offering is still being prepared and is not visible to investors.",
    investorAccess: "Hidden — no portal access",
    sponsorGuide:
      "Use while setting up the deal, documents, and class economics.",
  },
  coming_soon: {
    value: "coming_soon",
    label: "Coming Soon",
    tone: "amber",
    icon: Clock,
    description:
      "Investors may preview the offering, but new investments are not open yet.",
    investorAccess: "View only — invest disabled",
    sponsorGuide:
      "Use when the deal is ready to preview but not yet accepting commitments.",
  },
  open_soft_commitment: {
    value: "open_soft_commitment",
    label: "Open to Soft Commitment",
    tone: "blue",
    icon: Handshake,
    description:
      "Investors can view the offering, create their investor profile, and express interest in investing.",
    investorAccess: "View + Soft commit",
    sponsorGuide:
      "Use to gauge demand before requiring reservations or full investment.",
  },
  open_hard_commitment: {
    value: "open_hard_commitment",
    label: "Open to Hard Commitment",
    tone: "violet",
    icon: HandCoins,
    description:
      "Investors can create their investor profile and reserve their allocation in the offering.",
    investorAccess: "View + Reserve funds",
    sponsorGuide:
      "Use when you want investors to secure allocation before full closing.",
  },
  open_investment: {
    value: "open_investment",
    label: "Open to Investment",
    tone: "green",
    icon: CircleDollarSign,
    description:
      "Investors can complete onboarding, sign documents, and submit their investment.",
    investorAccess: "Full invest flow enabled",
    sponsorGuide:
      "Use when the deal is ready for subscriptions, signatures, and funding.",
  },
  waitlist: {
    value: "waitlist",
    label: "Waitlist",
    tone: "orange",
    icon: ShieldCheck,
    description:
      "Investors can request access; new investments require sponsor approval.",
    investorAccess: "Waitlist — approval required",
    sponsorGuide:
      "Use to control who may invest when capacity or eligibility is limited.",
  },
  closed: {
    value: "closed",
    label: "Closed",
    tone: "red",
    icon: Lock,
    description:
      "Fundraising is closed. Existing investors retain read-only access.",
    investorAccess: "Read-only — no new investments",
    sponsorGuide:
      "Use when fundraising is complete but the deal should stay visible.",
  },
  past: {
    value: "past",
    label: "Past",
    tone: "charcoal",
    icon: Archive,
    description:
      "The offering is archived and hidden from investor dashboards.",
    investorAccess: "No access",
    sponsorGuide: "Use for completed or archived deals that should not appear.",
  },
}

export const OFFERING_STATUS_OPTIONS_LIST: OfferingStatusMeta[] = Object.values(
  OFFERING_STATUS_CATALOG,
)

export function getOfferingStatusMeta(
  raw: string | null | undefined,
): OfferingStatusMeta | null {
  const v = String(raw ?? "").trim() as DealStatus
  if (!v) return null
  return OFFERING_STATUS_CATALOG[v as DealStatus] ?? null
}
