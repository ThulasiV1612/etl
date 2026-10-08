export type InvestNowW9FormValues = {
  /** Line 1 — Name (as shown on income tax return). */
  name: string
  /** Single-line mailing address shown when details are collapsed. */
  addressLine: string
  street1: string
  street2: string
  city: string
  state: string
  zip: string
  ssn: string
}

export const EMPTY_INVEST_NOW_W9: InvestNowW9FormValues = {
  name: "",
  addressLine: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  ssn: "",
}

export const INVEST_NOW_W9_NAME_LABEL =
  "Name (as shown on income tax return)"

export const INVEST_NOW_W9_NAME_HELP =
  "Enter the name shown on your federal income tax return."
