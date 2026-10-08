import type { Request, Response } from "express";
import { logSocDestructiveDealAction } from "../../audit/index.js";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdInViewerScope,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import {
  createClassSetupClass,
  deleteClassSetupClass,
  duplicateClassSetupClass,
  getClassSetupBundle,
  saveClassSetupBundle,
  updateClassSetupClass,
} from "../../services/classSetup/classSetup.service.js";
import type {
  ClassSetupClassPayload,
  ClassSetupSaveInput,
  ClassSetupType,
  PromoteHurdleBasis,
  PromoteMeasuredOn,
} from "../../services/classSetup/classSetup.types.js";
import {
  CLASS_SETUP_TYPES,
  PROMOTE_HURDLE_BASES,
  PROMOTE_MEASURED_ON,
} from "../../services/classSetup/classSetup.types.js";
import { validateClassSetup } from "../../services/classSetup/classSetup.validation.js";

function bodyString(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function paramId(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return "";
}

function parseSaveInput(body: unknown): ClassSetupSaveInput | null {
  if (body == null || typeof body !== "object" || Array.isArray(body))
    return null;
  const b = body as Record<string, unknown>;
  const metaRaw = b.meta;
  const classesRaw = b.classes;
  if (!Array.isArray(classesRaw)) return null;
  const metaObj =
    metaRaw != null && typeof metaRaw === "object" && !Array.isArray(metaRaw)
      ? (metaRaw as Record<string, unknown>)
      : {};
  const promoteRaw = metaObj.promote;
  const promoteObj =
    promoteRaw != null &&
    typeof promoteRaw === "object" &&
    !Array.isArray(promoteRaw)
      ? (promoteRaw as Record<string, unknown>)
      : {};
  const hurdlesRaw = Array.isArray(promoteObj.hurdles) ? promoteObj.hurdles : [];
  const sharesRaw =
    promoteObj.shares != null &&
    typeof promoteObj.shares === "object" &&
    !Array.isArray(promoteObj.shares)
      ? (promoteObj.shares as Record<string, unknown>)
      : {};
  return {
    meta: {
      targetRaise: bodyString(metaObj.targetRaise ?? metaObj.target_raise),
      latestChanges: bodyString(
        metaObj.latestChanges ?? metaObj.latest_changes,
      ),
      promote: {
        hurdles: hurdlesRaw.map((h, i) => {
          const row =
            h != null && typeof h === "object" && !Array.isArray(h)
              ? (h as Record<string, unknown>)
              : {};
          const basisRaw = bodyString(row.basis) || "Cumulative return";
          const measuredRaw =
            bodyString(row.measuredOn ?? row.measured_on) || "LP classes";
          const basis = (
            PROMOTE_HURDLE_BASES as readonly string[]
          ).includes(basisRaw)
            ? (basisRaw as PromoteHurdleBasis)
            : "Cumulative return";
          const measuredOn = (
            PROMOTE_MEASURED_ON as readonly string[]
          ).includes(measuredRaw)
            ? (measuredRaw as PromoteMeasuredOn)
            : "LP classes";
          return {
            id: bodyString(row.id) || `h${i + 1}`,
            rate: bodyString(row.rate) || "0",
            basis,
            measuredOn,
          };
        }),
        shares: Object.fromEntries(
          Object.entries(sharesRaw).map(([k, v]) => [
            k,
            Array.isArray(v)
              ? v.map((x) => bodyString(x) || "0")
              : [],
          ]),
        ),
      },
    },
    classes: classesRaw as ClassSetupClassPayload[],
  };
}

export async function getDealClassSetup(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId = paramId(req.params.dealId);
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const bundle = await getClassSetupBundle(dealId);
    if (!bundle) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const validation = validateClassSetup({
      meta: bundle.meta,
      classes: bundle.classes,
    });
    res.status(200).json({ classSetup: bundle, validation });
  } catch (err) {
    console.error("getDealClassSetup:", err);
    res.status(500).json({ message: "Could not load class setup" });
  }
}

export async function putDealClassSetup(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId = paramId(req.params.dealId);
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const input = parseSaveInput(req.body);
  if (!input) {
    res.status(400).json({ message: "Invalid class setup payload" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const result = await saveClassSetupBundle({ dealId, input });
    if (result.validationError) {
      const validation = validateClassSetup(input);
      res.status(400).json({
        message: result.validationError,
        validation,
      });
      return;
    }
    const validation = validateClassSetup({
      meta: result.bundle.meta,
      classes: result.bundle.classes,
    });
    res.status(200).json({
      message: "Class setup saved",
      classSetup: result.bundle,
      validation,
    });
  } catch (err) {
    console.error("putDealClassSetup:", err);
    res.status(500).json({ message: "Could not save class setup" });
  }
}

export async function postDealClassSetupClass(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId = paramId(req.params.dealId);
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const classType = bodyString(b.classType ?? b.class_type ?? "lp").toLowerCase();
  if (!(CLASS_SETUP_TYPES as readonly string[]).includes(classType)) {
    res.status(400).json({ message: `Invalid classType: ${classType}` });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const created = await createClassSetupClass({
      dealId,
      classType: classType as ClassSetupType,
    });
    res.status(201).json({ message: "Class created", class: created });
  } catch (err) {
    console.error("postDealClassSetupClass:", err);
    res.status(500).json({ message: "Could not create class" });
  }
}

export async function putDealClassSetupClass(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId = paramId(req.params.dealId);
  const classId = paramId(req.params.classId);
  if (!dealId || !classId) {
    res.status(400).json({ message: "Missing deal id or class id" });
    return;
  }
  const payload = req.body as ClassSetupClassPayload;
  if (!payload || typeof payload !== "object") {
    res.status(400).json({ message: "Invalid class payload" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const updated = await updateClassSetupClass({
      dealId,
      classId,
      payload,
    });
    if (!updated) {
      res.status(404).json({ message: "Class not found" });
      return;
    }
    res.status(200).json({ message: "Class updated", class: updated });
  } catch (err) {
    console.error("putDealClassSetupClass:", err);
    res.status(500).json({ message: "Could not update class" });
  }
}

export async function deleteDealClassSetupClass(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId = paramId(req.params.dealId);
  const classId = paramId(req.params.classId);
  if (!dealId || !classId) {
    res.status(400).json({ message: "Missing deal id or class id" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const ok = await deleteClassSetupClass({ dealId, classId });
    if (!ok) {
      res.status(404).json({ message: "Class not found" });
      return;
    }
    logSocDestructiveDealAction({
      action: "deal.investor_class_delete",
      actorUserId: user.id,
      dealId,
      resourceId: classId,
    });
    res.status(200).json({ message: "Class deleted" });
  } catch (err) {
    console.error("deleteDealClassSetupClass:", err);
    res.status(500).json({ message: "Could not delete class" });
  }
}

export async function postDealClassSetupClassDuplicate(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId = paramId(req.params.dealId);
  const classId = paramId(req.params.classId);
  if (!dealId || !classId) {
    res.status(400).json({ message: "Missing deal id or class id" });
    return;
  }
  try {
    const scope = await resolveDealViewerScope(
      user.id,
      user.userRole,
      requestedOrganizationIdFromRequest(req),
    );
    if (!(await assertDealIdInViewerScope(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const duplicated = await duplicateClassSetupClass({ dealId, classId });
    if (!duplicated) {
      res.status(404).json({ message: "Class not found" });
      return;
    }
    res.status(201).json({ message: "Class duplicated", class: duplicated });
  } catch (err) {
    console.error("postDealClassSetupClassDuplicate:", err);
    res.status(500).json({ message: "Could not duplicate class" });
  }
}
