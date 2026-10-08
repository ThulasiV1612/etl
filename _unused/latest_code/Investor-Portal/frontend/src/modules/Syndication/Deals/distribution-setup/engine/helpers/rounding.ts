/** Money / percent rounding used by distribution allocation. */

export function roundMoney(n: number, decimals = 2): number {
  if (!Number.isFinite(n)) return 0
  const f = 10 ** decimals
  return Math.round(Math.max(0, n) * f) / f
}

export function roundPct(n: number, decimals = 3): number {
  if (!Number.isFinite(n)) return 0
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

/**
 * Allocate integer cents across weights so the sum equals totalCents.
 * Largest-remainder method — avoids Wildflower-style 2¢ drift when possible.
 */
export function allocateCentsByWeight(params: {
  totalCents: number
  weights: number[]
}): number[] {
  const { totalCents, weights } = params
  if (!(totalCents > 0) || weights.length === 0)
    return weights.map(() => 0)
  const weightSum = weights.reduce((s, w) => s + Math.max(0, w), 0)
  if (!(weightSum > 0)) return weights.map(() => 0)

  const raw = weights.map((w) => (Math.max(0, w) / weightSum) * totalCents)
  const floors = raw.map((x) => Math.floor(x))
  let rem = totalCents - floors.reduce((s, x) => s + x, 0)
  const order = raw
    .map((x, i) => ({ i, frac: x - floors[i]!, w: Math.max(0, weights[i]!) }))
    // Remainder → largest weight first (Wildflower: $2500 / $1249.99 / $1249.99).
    // Fractional part is secondary so equal CoC shares stay stable.
    .sort((a, b) => b.w - a.w || b.frac - a.frac || a.i - b.i)
  const out = [...floors]
  for (let k = 0; k < order.length && rem > 0; k++) {
    out[order[k]!.i]! += 1
    rem -= 1
  }
  return out
}
