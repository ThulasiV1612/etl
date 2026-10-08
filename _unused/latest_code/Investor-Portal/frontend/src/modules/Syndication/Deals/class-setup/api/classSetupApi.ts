import { portalAuthHeaders } from "../../../../../common/auth/portalAuthHeaders"
import { getApiV1Base } from "../../../../../common/utils/apiBaseUrl"
import type {
  ClassSetupBundle,
  ClassSetupClass,
  ClassSetupDealMeta,
  ClassSetupType,
  ClassSetupValidation,
} from "../types/class-setup.types"
import { blurFormatMoneyInput } from "../../utils/offeringMoneyFormat"
import {
  normalizePromoteShares,
  parsePromoteFromMeta,
} from "../utils/promoteSchedule"

function moneyField(raw: unknown, fallback = "0"): string {
  const t = str(raw) || fallback
  return blurFormatMoneyInput(t) || blurFormatMoneyInput(fallback) || "$0"
}

function authHeaders(): HeadersInit {
  return portalAuthHeaders()
}

function newClientKey(): string {
  return `cls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v))
    return v as Record<string, unknown>
  return {}
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : ""
}

function normalizeClass(raw: Record<string, unknown>, index: number): ClassSetupClass {
  const pref = asRecord(raw.preferredReturn ?? raw.preferred_return)
  const prefEquity = asRecord(raw.prefEquity ?? raw.pref_equity)
  const mezz = asRecord(raw.mezz)
  const finalTier = asRecord(raw.finalTier ?? raw.final_tier)
  const tiersRaw = Array.isArray(raw.waterfallTiers)
    ? raw.waterfallTiers
    : Array.isArray(raw.waterfall_tiers)
      ? raw.waterfall_tiers
      : []

  return {
    id: str(raw.id) || undefined,
    clientKey: str(raw.id) || newClientKey(),
    name: str(raw.name) || `Class ${index + 1}`,
    classType: (str(raw.classType ?? raw.class_type) || "lp") as ClassSetupType,
    displayOrder: Number(raw.displayOrder ?? raw.display_order ?? index) || index,
    status: (str(raw.status) || "draft") as ClassSetupClass["status"],
    classGroup: str(raw.classGroup ?? raw.class_group),
    mapsTo: str(raw.mapsTo ?? raw.maps_to) || `Investor Class ${index + 1}`,
    committedCapital: moneyField(raw.committedCapital ?? raw.committed_capital),
    actuallyFunded: moneyField(raw.actuallyFunded ?? raw.actually_funded),
    minimumInvestment: moneyField(
      raw.minimumInvestment ?? raw.minimum_investment,
    ),
    equityPct: str(raw.equityPct ?? raw.equity_pct) || "0",
    preferredReturn: {
      enabled: Boolean(pref.enabled),
      rate: str(pref.rate) || "7",
      preferredType:
        (str(pref.preferredType ?? pref.preferred_type) as "single" | "split") ||
        "single",
      currentPortion: str(pref.currentPortion ?? pref.current_portion),
      accruedPortion: str(pref.accruedPortion ?? pref.accrued_portion),
      compounding:
        (str(pref.compounding) as "simple" | "compound") || "simple",
      distributionFrequency:
        (str(
          pref.distributionFrequency ?? pref.distribution_frequency,
        ) as ClassSetupClass["preferredReturn"]["distributionFrequency"]) ||
        "quarterly",
    },
    prefEquity: {
      totalRate: str(prefEquity.totalRate ?? prefEquity.total_rate) || "15",
      currentRate: str(prefEquity.currentRate ?? prefEquity.current_rate) || "8",
      accrualRate: str(prefEquity.accrualRate ?? prefEquity.accrual_rate) || "7",
    },
    mezz: {
      rate: str(mezz.rate) || "10",
      pay: str(mezz.pay) || "Current pay",
    },
    waterfallTiers: tiersRaw.map((t, i) => {
      const row = asRecord(t)
      return {
        id: str(row.id) || `tier_${i + 1}`,
        hurdleRate: str(row.hurdleRate ?? row.hurdle_rate) || "0",
        lpPct: str(row.lpPct ?? row.lp_pct) || "0",
        gpPct: str(row.gpPct ?? row.gp_pct) || "0",
      }
    }),
    finalTier: {
      lpPct: str(finalTier.lpPct ?? finalTier.lp_pct) || "70",
      gpPct: str(finalTier.gpPct ?? finalTier.gp_pct) || "30",
    },
    expanded: index === 0,
  }
}

function normalizeBundle(raw: Record<string, unknown>): ClassSetupBundle {
  const meta = asRecord(raw.meta)
  const classesRaw = Array.isArray(raw.classes) ? raw.classes : []
  const classes = classesRaw
    .map((c, i) => normalizeClass(asRecord(c), i))
    .sort((a, b) => a.displayOrder - b.displayOrder)
  const promote = normalizePromoteShares(
    parsePromoteFromMeta(asRecord(meta.promote)),
    classes,
  )
  return {
    dealId: str(raw.dealId ?? raw.deal_id),
    dealName: str(raw.dealName ?? raw.deal_name),
    meta: {
      targetRaise: moneyField(meta.targetRaise ?? meta.target_raise),
      latestChanges: str(meta.latestChanges ?? meta.latest_changes),
      promote,
    },
    classes,
  }
}

function normalizeValidation(raw: unknown): ClassSetupValidation | null {
  const o = asRecord(raw)
  if (!Array.isArray(o.checks)) return null
  return {
    checks: o.checks.map((c) => {
      const row = asRecord(c)
      return {
        id: str(row.id),
        ok: Boolean(row.ok),
        message: str(row.message),
      }
    }),
    fieldErrors: Array.isArray(o.fieldErrors)
      ? o.fieldErrors.map((e) => {
          const row = asRecord(e)
          return {
            classKey: str(row.classKey ?? row.class_key),
            field: str(row.field),
            message: str(row.message),
          }
        })
      : [],
    canSave: Boolean(o.canSave ?? o.can_save),
  }
}

function toApiClass(c: ClassSetupClass) {
  return {
    id: c.id,
    name: c.name,
    classType: c.classType,
    displayOrder: c.displayOrder,
    status: c.status,
    classGroup: c.classGroup,
    mapsTo: c.mapsTo,
    committedCapital: c.committedCapital,
    actuallyFunded: c.actuallyFunded,
    minimumInvestment: c.minimumInvestment,
    equityPct: c.equityPct,
    preferredReturn: c.preferredReturn,
    prefEquity: c.prefEquity,
    mezz: c.mezz,
    waterfallTiers: c.waterfallTiers,
    finalTier: c.finalTier,
  }
}

export async function fetchClassSetup(dealId: string): Promise<{
  bundle: ClassSetupBundle
  validation: ClassSetupValidation | null
}> {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/class-setup`,
    {
      headers: { ...authHeaders() },
      credentials: "include",
    },
  )
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok)
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  return {
    bundle: normalizeBundle(asRecord(data.classSetup ?? data.class_setup)),
    validation: normalizeValidation(data.validation),
  }
}

export async function saveClassSetup(
  dealId: string,
  meta: ClassSetupDealMeta,
  classes: ClassSetupClass[],
): Promise<{
  bundle: ClassSetupBundle
  validation: ClassSetupValidation | null
}> {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/class-setup`,
    {
      method: "PUT",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        meta,
        classes: classes.map(toApiClass),
      }),
    },
  )
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok)
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  return {
    bundle: normalizeBundle(asRecord(data.classSetup ?? data.class_setup)),
    validation: normalizeValidation(data.validation),
  }
}

export async function createClassSetupClassApi(
  dealId: string,
  classType: ClassSetupType,
): Promise<ClassSetupClass> {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/class-setup/classes`,
    {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ classType }),
    },
  )
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok)
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  return normalizeClass(asRecord(data.class), 0)
}

export async function deleteClassSetupClassApi(
  dealId: string,
  classId: string,
): Promise<void> {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/class-setup/classes/${encodeURIComponent(classId)}`,
    {
      method: "DELETE",
      headers: { ...authHeaders() },
      credentials: "include",
    },
  )
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  }
}

export async function duplicateClassSetupClassApi(
  dealId: string,
  classId: string,
): Promise<ClassSetupClass> {
  const base = getApiV1Base()
  if (!base) throw new Error("API is not configured (VITE_BASE_URL).")
  const res = await fetch(
    `${base}/deals/${encodeURIComponent(dealId)}/class-setup/classes/${encodeURIComponent(classId)}/duplicate`,
    {
      method: "POST",
      headers: { ...authHeaders() },
      credentials: "include",
    },
  )
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok)
    throw new Error(
      data.message != null ? String(data.message) : `Error ${res.status}`,
    )
  return normalizeClass(asRecord(data.class), 0)
}
