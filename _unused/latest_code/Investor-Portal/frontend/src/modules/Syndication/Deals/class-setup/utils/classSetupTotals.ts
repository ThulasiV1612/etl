import type { ClassSetupClass, ClassSetupDealMeta } from "../types/class-setup.types"

function toNum(v: string | number | undefined): number {
  const n = Number(String(v ?? "").replace(/[$,%\s,]/g, ""))
  return Number.isFinite(n) ? n : 0
}

export function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`
}

export function formatPct(n: number, digits = 1): string {
  return `${(Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits)}%`
}

export interface ClassSetupTotals {
  targetRaise: number
  actuallyFunded: number
  fundingPct: number
  equityClassCount: number
  fixedReturnClassCount: number
  equityOwnershipTotal: number
  preferredClassCount: number
  classCount: number
}

export function computeClassSetupTotals(
  meta: ClassSetupDealMeta,
  classes: ClassSetupClass[],
): ClassSetupTotals {
  const targetRaise = toNum(meta.targetRaise)
  const actuallyFunded = classes.reduce(
    (s, c) => s + toNum(c.actuallyFunded),
    0,
  )
  const equity = classes.filter(
    (c) => c.classType === "lp" || c.classType === "gp",
  )
  const fixed = classes.filter(
    (c) => c.classType === "preferred_equity" || c.classType === "mezzanine",
  )
  const preferredClassCount = classes.filter(
    (c) =>
      c.classType === "preferred_equity" ||
      (c.classType === "lp" && c.preferredReturn.enabled),
  ).length

  return {
    targetRaise,
    actuallyFunded,
    fundingPct: targetRaise > 0 ? (actuallyFunded / targetRaise) * 100 : 0,
    equityClassCount: equity.length,
    fixedReturnClassCount: fixed.length,
    equityOwnershipTotal: equity.reduce((s, c) => s + toNum(c.equityPct), 0),
    preferredClassCount,
    classCount: classes.length,
  }
}

export function newTierId(): string {
  return `tier_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function createLocalClass(
  classType: ClassSetupClass["classType"],
  displayOrder: number,
): ClassSetupClass {
  const groups = {
    lp: "Class A",
    gp: "Class C",
    preferred_equity: "Class B",
    mezzanine: "Class M",
  } as const

  return {
    clientKey: `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: groups[classType],
    classType,
    displayOrder,
    status: "draft",
    classGroup: groups[classType],
    mapsTo: `Investor Class`,
    committedCapital: "$0",
    actuallyFunded: "$0",
    minimumInvestment: classType === "gp" ? "$0" : "$25,000",
    equityPct: "0",
    preferredReturn: {
      enabled: classType === "lp",
      rate: "7",
      preferredType: "single",
      currentPortion: "",
      accruedPortion: "",
      compounding: "simple",
      distributionFrequency: "quarterly",
    },
    prefEquity: { totalRate: "15", currentRate: "8", accrualRate: "7" },
    mezz: { rate: "10", pay: "Current pay" },
    waterfallTiers:
      classType === "lp" || classType === "gp"
        ? [{ id: newTierId(), hurdleRate: "7", lpPct: "70", gpPct: "30" }]
        : [],
    finalTier: { lpPct: "70", gpPct: "30" },
    expanded: true,
  }
}
