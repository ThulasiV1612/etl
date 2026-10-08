import type {
  ClassSetupClass,
  ClassSetupPromoteHurdle,
  ClassSetupPromoteSchedule,
  PromoteHurdleBasis,
  PromoteMeasuredOn,
} from "../types/class-setup.types"
import {
  emptyPromoteSchedule,
  PROMOTE_HURDLE_BASES,
  PROMOTE_MEASURED_ON,
} from "../types/class-setup.types"

export function classShareKey(c: ClassSetupClass): string {
  return c.id || c.clientKey
}

export function isEquityParticipant(c: ClassSetupClass): boolean {
  return c.classType === "lp" || c.classType === "gp"
}

export function stageCount(promote: ClassSetupPromoteSchedule): number {
  return (promote.hurdles?.length ?? 0) + 1
}

export function hurdleLabel(h: ClassSetupPromoteHurdle): string {
  return `${h.rate || 0}% ${h.basis}`
}

function padShares(arr: string[] | undefined, stages: number): string[] {
  const next = [...(arr ?? [])].map((v) => String(v ?? "0"))
  while (next.length < stages) next.push(next.length ? next[next.length - 1]! : "0")
  if (next.length > stages) next.length = stages
  return next
}

/** Keep share arrays aligned with hurdles and equity classes (HTML normalizeShares). */
export function normalizePromoteShares(
  promote: ClassSetupPromoteSchedule,
  classes: ClassSetupClass[],
): ClassSetupPromoteSchedule {
  const hurdles =
    promote.hurdles?.length > 0
      ? promote.hurdles
      : emptyPromoteSchedule().hurdles
  const stages = hurdles.length + 1
  const participants = classes.filter(isEquityParticipant)
  const shares: Record<string, string[]> = {}

  for (const c of participants) {
    const key = classShareKey(c)
    shares[key] = padShares(promote.shares?.[key], stages)
  }

  return { hurdles, shares }
}

export function shareAt(
  promote: ClassSetupPromoteSchedule,
  classKey: string,
  stage: number,
): number {
  const n = Number(promote.shares?.[classKey]?.[stage] ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function stageShareSum(
  promote: ClassSetupPromoteSchedule,
  classes: ClassSetupClass[],
  stage: number,
): number {
  return classes
    .filter(isEquityParticipant)
    .reduce((sum, c) => sum + shareAt(promote, classShareKey(c), stage), 0)
}

export function formatShareSequence(
  promote: ClassSetupPromoteSchedule,
  classKey: string,
): string {
  const arr = promote.shares?.[classKey] ?? ["0"]
  return arr.map((v) => `${Number(v || 0)}%`).join(" → ")
}

export function newHurdleId(): string {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function addPromoteHurdle(
  promote: ClassSetupPromoteSchedule,
  classes: ClassSetupClass[],
): ClassSetupPromoteSchedule {
  const normalized = normalizePromoteShares(promote, classes)
  const prev = normalized.hurdles[normalized.hurdles.length - 1]
  const nextHurdle: ClassSetupPromoteHurdle = {
    id: newHurdleId(),
    rate: prev ? String(Number(prev.rate || 0) + 3) : "15",
    basis: prev?.basis ?? "IRR",
    measuredOn: prev?.measuredOn ?? "LP classes",
  }
  const hurdles = [...normalized.hurdles, nextHurdle]
  const shares: Record<string, string[]> = {}
  for (const [key, arr] of Object.entries(normalized.shares)) {
    const last = arr[arr.length - 1] ?? "0"
    shares[key] = [...arr, last]
  }
  return { hurdles, shares }
}

export function removePromoteHurdle(
  promote: ClassSetupPromoteSchedule,
  classes: ClassSetupClass[],
  index: number,
): ClassSetupPromoteSchedule {
  const normalized = normalizePromoteShares(promote, classes)
  if (index < 0 || index >= normalized.hurdles.length) return normalized
  const hurdles = normalized.hurdles.filter((_, i) => i !== index)
  const removeStage = index + 1
  const shares: Record<string, string[]> = {}
  for (const [key, arr] of Object.entries(normalized.shares)) {
    shares[key] = arr.filter((_, i) => i !== removeStage)
  }
  return normalizePromoteShares({ hurdles, shares }, classes)
}

export function updatePromoteShare(
  promote: ClassSetupPromoteSchedule,
  classKey: string,
  stage: number,
  value: string,
): ClassSetupPromoteSchedule {
  const stages = stageCount(promote)
  const current = padShares(promote.shares?.[classKey], stages)
  current[stage] = value
  return {
    ...promote,
    shares: { ...promote.shares, [classKey]: current },
  }
}

export function removeClassFromPromote(
  promote: ClassSetupPromoteSchedule,
  classKey: string,
): ClassSetupPromoteSchedule {
  const shares = { ...promote.shares }
  delete shares[classKey]
  return { ...promote, shares }
}

export function parsePromoteFromMeta(
  raw: Record<string, unknown> | undefined,
): ClassSetupPromoteSchedule {
  if (!raw) return emptyPromoteSchedule()
  const hurdlesRaw = Array.isArray(raw.hurdles) ? raw.hurdles : []
  const hurdles: ClassSetupPromoteHurdle[] = hurdlesRaw.map((h, i) => {
    const row =
      h != null && typeof h === "object" && !Array.isArray(h)
        ? (h as Record<string, unknown>)
        : {}
    const basisRaw = String(row.basis ?? "").trim()
    const measuredRaw = String(
      row.measuredOn ?? row.measured_on ?? "",
    ).trim()
    return {
      id: String(row.id ?? `h${i + 1}`),
      rate: String(row.rate ?? (i === 0 ? "12" : "15")),
      basis: (PROMOTE_HURDLE_BASES as readonly string[]).includes(basisRaw)
        ? (basisRaw as PromoteHurdleBasis)
        : "Cumulative return",
      measuredOn: (PROMOTE_MEASURED_ON as readonly string[]).includes(
        measuredRaw,
      )
        ? (measuredRaw as PromoteMeasuredOn)
        : "LP classes",
    }
  })

  const sharesRaw =
    raw.shares != null && typeof raw.shares === "object" && !Array.isArray(raw.shares)
      ? (raw.shares as Record<string, unknown>)
      : {}
  const shares: Record<string, string[]> = {}
  for (const [key, val] of Object.entries(sharesRaw)) {
    if (!Array.isArray(val)) continue
    shares[key] = val.map((v) => String(v ?? "0"))
  }

  if (hurdles.length === 0) return { ...emptyPromoteSchedule(), shares }
  return { hurdles, shares }
}
