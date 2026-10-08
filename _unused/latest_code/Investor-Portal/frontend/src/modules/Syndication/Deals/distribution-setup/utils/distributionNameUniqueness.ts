import type {
  DistributionFeeConfig,
  PriorDistributionRecord,
} from "../types/distribution-setup.types"

/** Case-insensitive trim key for distribution / fee names. */
export function normalizeDistributionNameKey(name: string): string {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

export type DistributionNameSource =
  | "fee"
  | "operating"
  | "capital"
  | "prior"

/**
 * Names already used across Acquisition Fee, Operating, and Capital event
 * (completed priors + saved fee). `excludePriorId` skips the run being edited.
 */
export function collectTakenDistributionNames(params: {
  priorDistributions: PriorDistributionRecord[]
  distributionFee?: DistributionFeeConfig | null
  excludePriorId?: string
  /** Skip completed fee-source runs (for fee-config save / fee complete). */
  ignoreFeeSourcePriors?: boolean
  /**
   * When true, do not treat other distribution runs as taken — duplicate
   * names are allowed across Distributions (Operating / Capital / priors).
   */
  ignorePriorNames?: boolean
}): Map<string, DistributionNameSource> {
  const taken = new Map<string, DistributionNameSource>()
  const exclude = String(params.excludePriorId ?? "")
    .trim()
    .toLowerCase()

  if (!params.ignorePriorNames) {
    for (const p of params.priorDistributions ?? []) {
      if (
        exclude &&
        String(p.id ?? "")
          .trim()
          .toLowerCase() === exclude
      )
        continue
      const src = String(p.source ?? "")
        .trim()
        .toLowerCase()
      // Fee-config validation ignores completed fee runs (same name is expected).
      if (
        params.ignoreFeeSourcePriors &&
        (src === "fee" || src === "distribution_fee")
      )
        continue
      const key = normalizeDistributionNameKey(p.name ?? "")
      if (!key || taken.has(key)) continue
      const source: DistributionNameSource =
        src === "capital" || src === "capital_event"
          ? "capital"
          : src === "fee" || src === "distribution_fee"
            ? "fee"
            : src === "operating"
              ? "operating"
              : "prior"
      taken.set(key, source)
    }
  }

  const feeKey = normalizeDistributionNameKey(
    params.distributionFee?.name ?? "",
  )
  if (feeKey && !taken.has(feeKey)) taken.set(feeKey, "fee")

  return taken
}

export function distributionNameSourceLabel(
  source: DistributionNameSource,
): string {
  if (source === "fee") return "GP Payment"
  if (source === "operating") return "Operating"
  if (source === "capital") return "Capital event"
  return "an existing distribution"
}

/**
 * Returns an error message when `candidate` collides with a taken name.
 * For fee saves, pass `ignoreFeeName: true` so the current fee name is not
 * treated as a self-collision.
 */
export function findDuplicateDistributionName(params: {
  candidate: string
  priorDistributions: PriorDistributionRecord[]
  distributionFee?: DistributionFeeConfig | null
  excludePriorId?: string
  /** When validating the fee itself, do not treat fee.name as taken. */
  ignoreFeeName?: boolean
  /**
   * When true, other distribution runs may share this name — only the
   * Acquisition Fee name (and `extraNames`) can still collide.
   */
  ignorePriorNames?: boolean
  /** Extra draft names (e.g. Operating / Capital distribution name field). */
  extraNames?: Array<{ name: string; source: DistributionNameSource }>
}): string | null {
  const key = normalizeDistributionNameKey(params.candidate)
  if (!key) return null

  const feeForTaken = params.ignoreFeeName
    ? null
    : params.distributionFee

  const taken = collectTakenDistributionNames({
    priorDistributions: params.priorDistributions,
    distributionFee: feeForTaken,
    excludePriorId: params.excludePriorId,
    ignoreFeeSourcePriors: params.ignoreFeeName === true,
    ignorePriorNames: params.ignorePriorNames === true,
  })

  for (const extra of params.extraNames ?? []) {
    const ek = normalizeDistributionNameKey(extra.name)
    if (!ek || taken.has(ek)) continue
    taken.set(ek, extra.source)
  }

  const hit = taken.get(key)
  if (!hit) return null
  return `“${params.candidate.trim()}” is already used on the ${distributionNameSourceLabel(hit)} tab. Choose a unique name.`
}
