import type {
  ClassSetupClass,
  ClassSetupDealMeta,
  ClassSetupPromoteSchedule,
  ClassSetupType,
} from "../types/class-setup.types"
import { normalizePromoteShares } from "./promoteSchedule"

function classKey(c: ClassSetupClass): string {
  return c.id || c.clientKey
}

/** Persistable fields only — ignore UI-only `expanded`. */
function classFingerprint(c: ClassSetupClass): string {
  return JSON.stringify({
    id: c.id ?? null,
    clientKey: c.clientKey,
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
  })
}

function sortedSectionClasses(
  classes: ClassSetupClass[],
  sectionType: ClassSetupType,
): ClassSetupClass[] {
  return classes
    .filter((c) => c.classType === sectionType)
    .slice()
    .sort((a, b) => classKey(a).localeCompare(classKey(b)))
}

function sharesEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) return false
  return left.every((v, i) => String(v) === String(right[i]))
}

function promoteHurdlesEqual(
  a: ClassSetupPromoteSchedule,
  b: ClassSetupPromoteSchedule,
): boolean {
  return JSON.stringify(a.hurdles) === JSON.stringify(b.hurdles)
}

export function isClassSectionDirty(args: {
  sectionType: ClassSetupType
  classes: ClassSetupClass[]
  meta: ClassSetupDealMeta
  snapshot: { meta: ClassSetupDealMeta; classes: ClassSetupClass[] }
}): boolean {
  const { sectionType, classes, meta, snapshot } = args
  const live = sortedSectionClasses(classes, sectionType)
  const saved = sortedSectionClasses(snapshot.classes, sectionType)

  if (live.length !== saved.length) return true
  for (let i = 0; i < live.length; i += 1) {
    if (classFingerprint(live[i]) !== classFingerprint(saved[i])) return true
  }

  if (sectionType !== "lp" && sectionType !== "gp") return false

  const livePromote = normalizePromoteShares(meta.promote, classes)
  const savedPromote = normalizePromoteShares(
    snapshot.meta.promote,
    snapshot.classes,
  )
  for (const c of live) {
    const key = classKey(c)
    if (!sharesEqual(livePromote.shares[key], savedPromote.shares[key]))
      return true
  }
  return false
}

export function isPromoteSectionDirty(args: {
  classes: ClassSetupClass[]
  meta: ClassSetupDealMeta
  snapshot: { meta: ClassSetupDealMeta; classes: ClassSetupClass[] }
}): boolean {
  const { classes, meta, snapshot } = args
  const live = normalizePromoteShares(meta.promote, classes)
  const saved = normalizePromoteShares(
    snapshot.meta.promote,
    snapshot.classes,
  )
  if (!promoteHurdlesEqual(live, saved)) return true

  const keys = new Set([
    ...Object.keys(live.shares),
    ...Object.keys(saved.shares),
  ])
  for (const key of keys) {
    if (!sharesEqual(live.shares[key], saved.shares[key])) return true
  }
  return false
}
