import type { Request, Response } from "express";
import { logSocDestructiveDealAction } from "../../audit/index.js";
import { getValidJwtUser } from "../../middleware/jwtUser.js";
import {
  assertDealIdInViewerScope,
  assertDealIdReadableOrAssignedParticipant,
  resolveDealViewerScope,
} from "../../services/deal/dealAccess.service.js";
import { requestedOrganizationIdFromRequest } from "../../services/org/orgResolution.service.js";
import {
  deleteInvestorClass,
  insertInvestorClass,
  listInvestorClassesByDealId,
  mapRowToJson,
  type InvestorClassInput,
  updateInvestorClass,
} from "../../services/deal/dealInvestorClass.service.js";
import { fundedAmountsByInvestorClassId } from "../../services/deal/dealInvestment.service.js";
import {
  INVESTOR_CLASS_SUBSCRIPTION_TYPES,
  normalizeInvestorClassAdvancedOptionsJson,
} from "../../services/deal/dealInvestorClassAdvancedOptions.js";

function bodyString(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function emptyInvestorClassInput(): InvestorClassInput {
  return {
    name: "",
    subscriptionType: "",
    entityName: "",
    startDate: "",
    offeringSize: "",
    raiseAmountDistributions: "",
    billingRaiseQuota: "",
    minimumInvestment: "",
    numberOfUnits: "",
    pricePerUnit: "",
    status: "draft",
    visibility: "",
    advancedOptionsJson: "{}",
  };
}

function parseAdvancedOptionsJsonFromBody(
  b: Record<string, unknown>,
  subscriptionType: string,
): { json: string; error?: string } {
  const raw = b.advanced_options_json ?? b.advancedOptionsJson;
  let advancedOptionsJson = "{}";
  if (typeof raw === "string") {
    advancedOptionsJson = raw;
  } else if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    try {
      advancedOptionsJson = JSON.stringify(raw);
    } catch {
      return { json: "{}", error: "advanced_options_json must be valid JSON" };
    }
  }
  const maxInvestment = bodyString(
    b.maximum_investment ?? b.maximumInvestment,
  ).trim();
  return normalizeInvestorClassAdvancedOptionsJson({
    subscriptionType,
    advancedOptionsJson,
    maximumInvestment: maxInvestment || undefined,
  });
}

function parseInput(
  b: Record<string, unknown>,
): { input: InvestorClassInput; error?: string } {
  const subscriptionType = bodyString(
    b.subscription_type ?? b.subscriptionType,
  ).trim();
  if (
    subscriptionType &&
    !(INVESTOR_CLASS_SUBSCRIPTION_TYPES as readonly string[]).includes(
      subscriptionType.toLowerCase(),
    )
  ) {
    return {
      input: emptyInvestorClassInput(),
      error: `Invalid subscription_type: ${subscriptionType}`,
    };
  }
  const advanced = parseAdvancedOptionsJsonFromBody(b, subscriptionType);
  if (advanced.error) {
    return { input: emptyInvestorClassInput(), error: advanced.error };
  }
  return {
    input: {
      name: bodyString(b.name).trim(),
      subscriptionType,
      entityName: bodyString(b.entity_name ?? b.entityName).trim(),
      startDate: bodyString(b.start_date ?? b.startDate).trim(),
      offeringSize: bodyString(b.offering_size ?? b.offeringSize).trim(),
      raiseAmountDistributions: bodyString(
        b.raise_amount_distributions ?? b.raiseAmountDistributions,
      ).trim(),
      billingRaiseQuota: bodyString(
        b.billing_raise_quota ?? b.billingRaiseQuota,
      ).trim(),
      minimumInvestment: bodyString(
        b.minimum_investment ?? b.minimumInvestment,
      ).trim(),
      numberOfUnits: bodyString(
        b.number_of_units ?? b.numberOfUnits,
      ).trim(),
      pricePerUnit: bodyString(b.price_per_unit ?? b.pricePerUnit).trim(),
      status: bodyString(b.status).trim() || "draft",
      visibility: bodyString(b.visibility).trim(),
      advancedOptionsJson: advanced.json,
    },
  };
}

export async function getDealInvestorClasses(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
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
    if (!(await assertDealIdReadableOrAssignedParticipant(dealId, scope))) {
      res.status(404).json({ message: "Deal not found" });
      return;
    }
    const rows = await listInvestorClassesByDealId(dealId);
    const fundedById = await fundedAmountsByInvestorClassId(
      dealId,
      rows.map((r) => ({ id: r.id, name: r.name })),
    );
    res.status(200).json({
      investorClasses: rows.map((row) => {
        const json = mapRowToJson(row);
        const funded = fundedById.get(row.id) ?? 0;
        return {
          ...json,
          raiseAmountDistributions: String(Math.round(funded * 100) / 100),
        };
      }),
    });
  } catch (err) {
    console.error("getDealInvestorClasses:", err);
    res.status(500).json({ message: "Could not load investor classes" });
  }
}

export async function postDealInvestorClass(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  if (!dealId) {
    res.status(400).json({ message: "Missing deal id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const parsed = parseInput(b);
  if (parsed.error) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  const input = parsed.input;
  if (!input.name) {
    res.status(400).json({ message: "Name is required" });
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
    const row = await insertInvestorClass({ dealId, input });
    res.status(201).json({
      message: "Investor class created",
      investorClass: mapRowToJson(row),
    });
  } catch (err) {
    console.error("postDealInvestorClass:", err);
    res.status(500).json({ message: "Could not create investor class" });
  }
}

export async function putDealInvestorClass(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  const classId =
    typeof req.params.classId === "string"
      ? req.params.classId
      : req.params.classId?.[0];
  if (!dealId || !classId) {
    res.status(400).json({ message: "Missing deal id or class id" });
    return;
  }
  const b = req.body as Record<string, unknown>;
  const parsed = parseInput(b);
  if (parsed.error) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  const input = parsed.input;
  if (!input.name) {
    res.status(400).json({ message: "Name is required" });
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
    const row = await updateInvestorClass({ dealId, classId, input });
    if (!row) {
      res.status(404).json({ message: "Investor class not found" });
      return;
    }
    res.status(200).json({
      message: "Investor class updated",
      investorClass: mapRowToJson(row),
    });
  } catch (err) {
    console.error("putDealInvestorClass:", err);
    res.status(500).json({ message: "Could not update investor class" });
  }
}

export async function deleteDealInvestorClass(
  req: Request,
  res: Response,
): Promise<void> {
  const user = await getValidJwtUser(req);
  if (!user?.id) {
    res.status(401).json({ message: "Authorization required" });
    return;
  }
  const dealId =
    typeof req.params.dealId === "string"
      ? req.params.dealId
      : req.params.dealId?.[0];
  const classId =
    typeof req.params.classId === "string"
      ? req.params.classId
      : req.params.classId?.[0];
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
    const ok = await deleteInvestorClass({ dealId, classId });
    if (!ok) {
      res.status(404).json({ message: "Investor class not found" });
      return;
    }
    logSocDestructiveDealAction({
      action: "deal.investor_class_delete",
      actorUserId: user.id,
      dealId,
      resourceId: classId,
    });
    res.status(200).json({ message: "Investor class deleted" });
  } catch (err) {
    console.error("deleteDealInvestorClass:", err);
    res.status(500).json({ message: "Could not delete investor class" });
  }
}
