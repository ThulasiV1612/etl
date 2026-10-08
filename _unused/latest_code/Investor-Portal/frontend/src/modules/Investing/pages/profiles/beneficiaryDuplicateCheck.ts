export const BENEFICIARY_DUPLICATE_MESSAGE =
  "A beneficiary with this name and address already exists."

export type BeneficiaryDuplicateRow = {
  id: string
  fullName: string
  addressQuery: string
  archived?: boolean
}

function beneficiaryKey(fullName: string, addressQuery: string): string {
  const norm = (s: string) =>
    (s ?? "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
  return `${norm(fullName)}|${norm(addressQuery)}`
}

/** True if another active beneficiary shares the same full name and address. */
export function hasActiveBeneficiaryDuplicate(
  beneficiaries: BeneficiaryDuplicateRow[],
  fullName: string,
  addressQuery: string,
  excludeBeneficiaryId?: string,
): boolean {
  const target = beneficiaryKey(fullName, addressQuery)
  return beneficiaries.some((b) => {
    if (b.archived) return false
    if (excludeBeneficiaryId && b.id === excludeBeneficiaryId) return false
    return beneficiaryKey(b.fullName, b.addressQuery) === target
  })
}
