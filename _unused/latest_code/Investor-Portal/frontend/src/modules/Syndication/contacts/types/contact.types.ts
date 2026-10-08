export type ContactStatus = "active" | "suspended"

export type ContactSource = "local" | "ghl"

/**
 * Per-contact offering visibility on the investor portal.
 * `null` / unset → treat as all offerings when filtering deals.
 */
export type ContactOfferingVisibility =
  | "ALL_OFFERINGS"
  | "HIDE_OFFERINGS"
  | "506C_ONLY"

export const CONTACT_OFFERING_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: ContactOfferingVisibility
  label: string
}> = [
  { value: "ALL_OFFERINGS", label: "Show Offerings" },
  { value: "HIDE_OFFERINGS", label: "Hide Offerings" },
  { value: "506C_ONLY", label: "506(c) offerings only" },
]

export interface ContactRow {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  note: string
  tags: string[]
  lists: string[]
  owners: string[]
  /** `active` (default) or `suspended` */
  status?: ContactStatus
  /**
   * Offering visibility for this contact.
   * `null` when unset (optional field).
   * Stored in DB as `contact.show_offerings_visibility`.
   */
  showOfferingsVisibility?: ContactOfferingVisibility | null
  /** Accreditation status; `null` when unset */
  accreditationStatus?: string | null
  /** Relationship start date (YYYY-MM-DD); `null` when unset */
  knownSince?: string | null
  /** Reason from the most recent edit (required when saving edits) */
  lastEditReason?: string
  /** Resolved display name for the user who created the row (from API) */
  createdByDisplayName?: string
  /** ISO timestamp when the contact was created (from API) */
  createdAt?: string
  /**
   * Distinct deals linked to this contact (viewer deal scope): investment
   * `contact_id` equals this contact id, or a portal user with the same email.
   */
  dealCount?: number
  /** Present when the row is sourced from GoHighLevel CRM */
  source?: ContactSource
  /** GoHighLevel contact id when `source` is `ghl` */
  ghlId?: string
  /** GHL rows are read-only in SyndicationX */
  readOnly?: boolean
  /** Original GHL lead source label */
  ghlSource?: string
  companyName?: string
  address?: string
  city?: string
  state?: string
  country?: string
  postalCode?: string
  website?: string
  timezone?: string
  assignedTo?: string
  contactType?: string
  customFields?: Array<{ label: string; value: string }>
  updatedAt?: string
}
