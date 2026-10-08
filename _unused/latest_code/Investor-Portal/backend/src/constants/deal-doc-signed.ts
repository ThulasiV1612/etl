/** Stored in `doc_signed_date` when eSign was sent but not yet completed. */
export const DOC_SIGNED_ESIGN_PENDING = "pending";

/** Stored in `doc_signed_date` when the investor finished all eSign documents. */
export const DOC_SIGNED_ESIGN_COMPLETED = "completed";

export function isDocSignedEsignPending(
  raw: string | null | undefined,
): boolean {
  return String(raw ?? "").trim().toLowerCase() === DOC_SIGNED_ESIGN_PENDING;
}

export function isDocSignedEsignCompleted(
  raw: string | null | undefined,
): boolean {
  return String(raw ?? "").trim().toLowerCase() === DOC_SIGNED_ESIGN_COMPLETED;
}
