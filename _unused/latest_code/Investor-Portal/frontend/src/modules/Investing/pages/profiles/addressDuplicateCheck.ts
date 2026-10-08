import { isUnitedStatesCountry } from "@/modules/Syndication/Deals/constants/usLocations"
import { normalizeZipCodeDigits } from "@/modules/Syndication/Deals/utils/dealZipCode"
import type { AddressFormDraft, SavedAddress } from "./address.types"

export const ADDRESS_DUPLICATE_MESSAGE =
  "This address has already been saved."

function normText(value: string): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase()
}

function normZip(country: string, zip: string): string {
  const trimmed = (zip ?? "").trim()
  if (isUnitedStatesCountry(country)) {
    return normalizeZipCodeDigits(trimmed)
  }
  return normText(trimmed)
}

export type AddressLocationFields = Pick<
  AddressFormDraft,
  "country" | "street1" | "street2" | "city" | "state" | "zip"
>

/** Stable key for the physical address (excludes name, memo, and notes). */
export function addressLocationKey(fields: AddressLocationFields): string {
  return [
    normText(fields.country),
    normText(fields.street1),
    normText(fields.street2),
    normText(fields.city),
    normText(fields.state),
    normZip(fields.country, fields.zip),
  ].join("|")
}

/** True if another active saved address matches the same physical location. */
export function hasActiveAddressDuplicate(
  addresses: SavedAddress[],
  draft: AddressLocationFields,
  excludeAddressId?: string,
): boolean {
  const target = addressLocationKey(draft)
  return addresses.some((a) => {
    if (a.archived) return false
    if (excludeAddressId && a.id === excludeAddressId) return false
    return addressLocationKey(a) === target
  })
}
