/**
 * Class Setup service — load/save deal-level class configuration.
 * Uses deal_investor_class rows + add_deal_form.class_setup_json.
 * No distribution calculations.
 */

import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { addDealForm } from "../../schema/deal.schema/add-deal-form.schema.js";
import {
  deleteInvestorClass,
  insertInvestorClass,
  listInvestorClassesByDealId,
  updateInvestorClass,
} from "../deal/dealInvestorClass.service.js";
import { fundedAmountsByInvestorClassId } from "../deal/dealInvestment.service.js";
import {
  classSetupPayloadToInvestorClassInput,
  defaultClassName,
  emptyClassSetupPayload,
  parseDealClassSetupMeta,
  rowToClassSetupPayload,
  serializeDealClassSetupMeta,
} from "./classSetup.mapper.js";
import type {
  ClassSetupBundle,
  ClassSetupClassPayload,
  ClassSetupSaveInput,
  ClassSetupType,
} from "./classSetup.types.js";
import { validateClassSetup } from "./classSetup.validation.js";

function formatFundedUsd(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, n) : 0;
  return String(Math.round(v * 100) / 100);
}

async function applyFundedFromInvestments(
  dealId: string,
  classes: ClassSetupClassPayload[],
): Promise<ClassSetupClassPayload[]> {
  const withIds = classes.filter(
    (c): c is ClassSetupClassPayload & { id: string } => Boolean(c.id),
  );
  const fundedById = await fundedAmountsByInvestorClassId(
    dealId,
    withIds.map((c) => ({ id: c.id, name: c.name })),
  );
  return classes.map((c) => {
    if (!c.id) return { ...c, actuallyFunded: formatFundedUsd(0) };
    return {
      ...c,
      actuallyFunded: formatFundedUsd(fundedById.get(c.id) ?? 0),
    };
  });
}

export async function getClassSetupBundle(
  dealId: string,
): Promise<ClassSetupBundle | null> {
  const [deal] = await db
    .select({
      id: addDealForm.id,
      dealName: addDealForm.dealName,
      classSetupJson: addDealForm.classSetupJson,
    })
    .from(addDealForm)
    .where(eq(addDealForm.id, dealId))
    .limit(1);

  if (!deal) return null;

  const rows = await listInvestorClassesByDealId(dealId);
  const classes = await applyFundedFromInvestments(
    dealId,
    rows
      .map((row, i) => rowToClassSetupPayload(row, i))
      .sort((a, b) => a.displayOrder - b.displayOrder),
  );

  return {
    dealId: deal.id,
    dealName: deal.dealName,
    meta: parseDealClassSetupMeta(deal.classSetupJson ?? "{}"),
    classes,
  };
}

export async function saveClassSetupBundle(params: {
  dealId: string;
  input: ClassSetupSaveInput;
}): Promise<{ bundle: ClassSetupBundle; validationError?: string }> {
  const validation = validateClassSetup(params.input);
  // Soft save: only hard-block missing LP / missing class names.
  // Ownership ≠ 100% and promote splits are warnings, not save blockers.
  const nameError = validation.fieldErrors.find((e) => e.field === "name");
  const hasLp = validation.checks.find((c) => c.id === "has_lp")?.ok !== false;
  const softCanSave =
    params.input.classes.length > 0 && !nameError && hasLp;

  if (!softCanSave) {
    const first =
      nameError?.message ||
      validation.checks.find((c) => c.id === "has_lp" && !c.ok)?.message ||
      validation.fieldErrors[0]?.message ||
      "Class setup is invalid";
    return {
      bundle: {
        dealId: params.dealId,
        dealName: "",
        meta: params.input.meta,
        classes: params.input.classes,
      },
      validationError: first,
    };
  }

  const existing = await listInvestorClassesByDealId(params.dealId);
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const keptIds = new Set<string>();

  const ordered = await applyFundedFromInvestments(
    params.dealId,
    [...params.input.classes]
      .map((c, i) => ({ ...c, displayOrder: i }))
      .sort((a, b) => a.displayOrder - b.displayOrder),
  );

  for (const payload of ordered) {
    const existingRow = payload.id ? existingById.get(payload.id) : undefined;
    const input = classSetupPayloadToInvestorClassInput(
      payload,
      existingRow?.advancedOptionsJson,
    );

    if (existingRow) {
      await updateInvestorClass({
        dealId: params.dealId,
        classId: existingRow.id,
        input,
      });
      keptIds.add(existingRow.id);
    } else {
      const inserted = await insertInvestorClass({
        dealId: params.dealId,
        input,
      });
      keptIds.add(inserted.id);
    }
  }

  for (const row of existing) {
    if (!keptIds.has(row.id)) {
      await deleteInvestorClass({
        dealId: params.dealId,
        classId: row.id,
      });
    }
  }

  const stamp = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  await db
    .update(addDealForm)
    .set({
      classSetupJson: serializeDealClassSetupMeta({
        ...params.input.meta,
        latestChanges: `Saved ${stamp}`,
      }),
    })
    .where(eq(addDealForm.id, params.dealId));

  const bundle = await getClassSetupBundle(params.dealId);
  if (!bundle) throw new Error("CLASS_SETUP_SAVE_RELOAD_FAILED");
  return { bundle };
}

export async function createClassSetupClass(params: {
  dealId: string;
  classType: ClassSetupType;
}): Promise<ClassSetupClassPayload> {
  const rows = await listInvestorClassesByDealId(params.dealId);
  const sameTypeCount =
    rows.filter((r) => r.subscriptionType === params.classType).length + 1;
  const payload = emptyClassSetupPayload(params.classType, rows.length);
  payload.name = defaultClassName(params.classType, sameTypeCount);

  const input = classSetupPayloadToInvestorClassInput(payload);
  const inserted = await insertInvestorClass({
    dealId: params.dealId,
    input,
  });
  return rowToClassSetupPayload(inserted, rows.length);
}

export async function duplicateClassSetupClass(params: {
  dealId: string;
  classId: string;
}): Promise<ClassSetupClassPayload | null> {
  const rows = await listInvestorClassesByDealId(params.dealId);
  const source = rows.find((r) => r.id === params.classId);
  if (!source) return null;

  const payload = rowToClassSetupPayload(source, rows.length);
  delete payload.id;
  payload.name = `${payload.name} (copy)`;
  payload.displayOrder = rows.length;
  payload.status = "draft";

  const input = classSetupPayloadToInvestorClassInput(
    payload,
    source.advancedOptionsJson,
  );
  const inserted = await insertInvestorClass({
    dealId: params.dealId,
    input,
  });
  return rowToClassSetupPayload(inserted, rows.length);
}

export async function deleteClassSetupClass(params: {
  dealId: string;
  classId: string;
}): Promise<boolean> {
  const deleted = await deleteInvestorClass(params);
  return deleted;
}

export async function updateClassSetupClass(params: {
  dealId: string;
  classId: string;
  payload: ClassSetupClassPayload;
}): Promise<ClassSetupClassPayload | null> {
  const rows = await listInvestorClassesByDealId(params.dealId);
  const existing = rows.find((r) => r.id === params.classId);
  if (!existing) return null;

  const input = classSetupPayloadToInvestorClassInput(
    { ...params.payload, id: params.classId },
    existing.advancedOptionsJson,
  );
  const updated = await updateInvestorClass({
    dealId: params.dealId,
    classId: params.classId,
    input,
  });
  if (!updated) return null;
  return rowToClassSetupPayload(
    updated,
    rows.findIndex((r) => r.id === params.classId),
  );
}
