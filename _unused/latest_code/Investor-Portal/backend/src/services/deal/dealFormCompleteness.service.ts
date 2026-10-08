import { isDealStageDraft } from "../../constants/deal-lifecycle/deal-stage.js";
import type { AddDealFormRow } from "../../schema/deal.schema/add-deal-form.schema.js";
import { listAddDealFormsByIds } from "./dealForm.service.js";

/** Matches create-deal autosave placeholders (`buildCreateDealFormDataForAutosave`). */
export const DEAL_FORM_AUTOSAVE_PLACEHOLDER = "Pending";

export function isDealFormAutosavePlaceholder(
  value: string | null | undefined,
): boolean {
  return (
    String(value ?? "").trim().toLowerCase() ===
    DEAL_FORM_AUTOSAVE_PLACEHOLDER.toLowerCase()
  );
}

/**
 * True when the deal wizard is unfinished: lifecycle Draft and/or required fields
 * still hold autosave placeholders.
 */
export function isAddDealFormIncomplete(
  row: Pick<
    AddDealFormRow,
    "dealStage" | "secType" | "owningEntityName" | "propertyName" | "city"
  >,
): boolean {
  if (isDealStageDraft(row.dealStage)) return true;
  if (isDealFormAutosavePlaceholder(row.secType)) return true;
  if (isDealFormAutosavePlaceholder(row.owningEntityName)) return true;
  if (isDealFormAutosavePlaceholder(row.propertyName)) return true;
  if (isDealFormAutosavePlaceholder(row.city)) return true;
  return false;
}

/** Investors must not see draft / incomplete deals in lists or read APIs. */
export async function filterDealIdsVisibleToInvestors(
  dealIds: string[],
): Promise<string[]> {
  const ids = [...new Set(dealIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = await listAddDealFormsByIds(ids);
  const allowed = new Set(
    rows
      .filter((row) => !isAddDealFormIncomplete(row))
      .map((row) => String(row.id)),
  );
  return ids.filter((id) => allowed.has(id));
}
