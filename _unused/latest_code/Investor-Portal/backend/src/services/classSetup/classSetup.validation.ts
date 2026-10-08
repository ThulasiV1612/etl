/** Real-time / save-time validation for Class Setup (config only). */

import type {
  ClassSetupClassPayload,
  ClassSetupSaveInput,
} from "./classSetup.types.js";
import { CLASS_SETUP_TYPES } from "./classSetup.types.js";

export interface ClassSetupCheck {
  id: string;
  ok: boolean;
  message: string;
}

export interface ClassSetupFieldError {
  classKey: string;
  field: string;
  message: string;
}

export interface ClassSetupValidationResult {
  checks: ClassSetupCheck[];
  fieldErrors: ClassSetupFieldError[];
  canSave: boolean;
}

function toNum(v: string | number | undefined): number {
  const n = Number(String(v ?? "").replace(/[$,%\s,]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function approxEqual(a: number, b: number, eps = 0.05): boolean {
  return Math.abs(a - b) < eps;
}

function classKey(c: ClassSetupClassPayload, index: number): string {
  return c.id || `new_${index}`;
}

function shareKey(c: ClassSetupClassPayload, index: number): string {
  return c.id || `new_${index}`;
}

export function validateClassSetup(
  input: ClassSetupSaveInput,
): ClassSetupValidationResult {
  const classes = input.classes ?? [];
  const checks: ClassSetupCheck[] = [];
  const fieldErrors: ClassSetupFieldError[] = [];

  const equityClasses = classes.filter(
    (c) => c.classType === "lp" || c.classType === "gp",
  );
  const ownershipTotal = equityClasses.reduce(
    (s, c) => s + (toNum(c.equityPct) || 0),
    0,
  );
  const ownershipOk = approxEqual(ownershipTotal, 100);
  checks.push({
    id: "ownership_100",
    ok: ownershipOk || equityClasses.length === 0,
    message:
      ownershipOk || equityClasses.length === 0
        ? "LP + GP ownership equals 100%"
        : `LP + GP ownership totals ${ownershipTotal.toFixed(1)}% — must equal 100%`,
  });

  const hasLp = classes.some((c) => c.classType === "lp");
  checks.push({
    id: "has_lp",
    ok: hasLp,
    message: hasLp
      ? "At least one LP class exists"
      : "At least one LP class is required",
  });

  let prefCurrentOk = true;
  for (const c of classes) {
    if (c.classType !== "preferred_equity") continue;
    const total = toNum(c.prefEquity.totalRate);
    const current = toNum(c.prefEquity.currentRate);
    if (
      Number.isFinite(total) &&
      Number.isFinite(current) &&
      current > total + 0.0001
    ) {
      prefCurrentOk = false;
      break;
    }
  }
  for (const c of classes) {
    if (c.classType !== "lp" || !c.preferredReturn.enabled) continue;
    if (c.preferredReturn.preferredType !== "split") continue;
    const total = toNum(c.preferredReturn.rate);
    const current = toNum(c.preferredReturn.currentPortion);
    if (
      Number.isFinite(total) &&
      Number.isFinite(current) &&
      current > total + 0.0001
    ) {
      prefCurrentOk = false;
      break;
    }
  }
  checks.push({
    id: "pref_current",
    ok: prefCurrentOk,
    message: prefCurrentOk
      ? "Preferred current portion does not exceed total preferred rate"
      : "Preferred current portion exceeds total preferred rate",
  });

  let requiredOk = true;

  classes.forEach((c, index) => {
    const key = classKey(c, index);

    if (!(CLASS_SETUP_TYPES as readonly string[]).includes(c.classType)) {
      requiredOk = false;
      fieldErrors.push({
        classKey: key,
        field: "classType",
        message: "Class type is required",
      });
    }
    if (!c.name?.trim()) {
      requiredOk = false;
      fieldErrors.push({
        classKey: key,
        field: "name",
        message: "Class name is required",
      });
    }

    if (c.classType === "lp" || c.classType === "gp") {
      const eq = toNum(c.equityPct);
      if (!Number.isFinite(eq) || eq < 0 || eq > 100) {
        requiredOk = false;
        fieldErrors.push({
          classKey: key,
          field: "equityPct",
          message: "Equity % must be between 0 and 100",
        });
      }
    }

    if (
      c.classType === "lp" &&
      c.preferredReturn.enabled &&
      c.preferredReturn.preferredType === "split"
    ) {
      const total = toNum(c.preferredReturn.rate);
      const current = toNum(c.preferredReturn.currentPortion);
      const accrued = toNum(c.preferredReturn.accruedPortion);
      if (Number.isFinite(total) && Number.isFinite(current) && current > total) {
        fieldErrors.push({
          classKey: key,
          field: "preferredReturn.currentPortion",
          message: "Current portion cannot exceed preferred rate",
        });
      }
      if (
        Number.isFinite(total) &&
        Number.isFinite(current) &&
        Number.isFinite(accrued) &&
        !approxEqual(current + accrued, total, 0.05)
      ) {
        fieldErrors.push({
          classKey: key,
          field: "preferredReturn.accruedPortion",
          message: "Current + accrued should equal preferred rate",
        });
      }
    }

    if (c.classType === "preferred_equity") {
      const total = toNum(c.prefEquity.totalRate);
      const current = toNum(c.prefEquity.currentRate);
      if (Number.isFinite(total) && Number.isFinite(current) && current > total) {
        fieldErrors.push({
          classKey: key,
          field: "prefEquity.currentRate",
          message: "Current rate cannot exceed total preferred rate",
        });
      }
    }
  });

  const promote = input.meta?.promote;
  const hurdles = promote?.hurdles ?? [];
  const stages = hurdles.length + 1;
  let promoteOk = true;

  if (equityClasses.length > 0 && promote) {
    for (let s = 0; s < stages; s++) {
      const sum = equityClasses.reduce((t, c, i) => {
        const key = shareKey(c, i);
        const n = toNum(promote.shares?.[key]?.[s] ?? "0");
        return t + (Number.isFinite(n) ? n : 0);
      }, 0);
      const ok = approxEqual(sum, 100, 0.5);
      if (!ok) promoteOk = false;
      const label = s === 0 ? "base shares" : `shares after Hurdle ${s}`;
      checks.push({
        id: `promote_stage_${s}`,
        ok,
        message: ok
          ? `Stage ${s + 1} split (${label}) totals 100%`
          : `Stage ${s + 1} split (${label}) totals ${sum.toFixed(1)}% — must equal 100%`,
      });
    }
  }

  checks.push({
    id: "hurdle_splits",
    ok: promoteOk || equityClasses.length === 0,
    message:
      promoteOk || equityClasses.length === 0
        ? "Every promote stage totals 100%"
        : "One or more promote stages do not total 100%",
  });

  checks.push({
    id: "required_fields",
    ok: requiredOk && fieldErrors.filter((e) => e.field === "name").length === 0,
    message:
      requiredOk && fieldErrors.filter((e) => e.field === "name").length === 0
        ? "Required fields completed"
        : "Required fields are incomplete",
  });

  // Soft gate: ownership / promote / pref checks stay visible but do not block
  // Save — Class Setup must persist mid-configuration (e.g. ownership at 50%).
  const nameErrors = fieldErrors.filter((e) => e.field === "name");

  const canSave = classes.length > 0 && nameErrors.length === 0 && hasLp;

  return { checks, fieldErrors, canSave };
}
