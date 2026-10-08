/**
 * In-process lock so a deal can start only one SaaS payment at a time.
 * Does not charge or talk to Stripe — it only gates overlapping starts.
 */

const IN_FLIGHT_MS = 60_000;

type HoldKind = "inflight" | "pending";

type Hold = {
  kind: HoldKind;
  until: number;
};

const holds = new Map<string, Hold>();

function now(): number {
  return Date.now();
}

function sweep(): void {
  const t = now();
  for (const [key, hold] of holds) {
    if (hold.until <= t) holds.delete(key);
  }
}

export function billingPaymentLockKey(
  companyId: string,
  dealId: string,
): string {
  return `${companyId.trim().toLowerCase()}:${dealId.trim().toLowerCase()}`;
}

export function hasBillingPaymentHold(key: string): boolean {
  sweep();
  const hold = holds.get(key);
  return Boolean(hold && hold.until > now());
}

/**
 * Take the in-flight lock. Returns false only when another start is still running.
 * An abandoned Checkout tab (pending) is replaced so Upgrade plan / retry can pay.
 */
export function acquireBillingPaymentHold(key: string): boolean {
  sweep();
  const hold = holds.get(key);
  if (hold && hold.until > now() && hold.kind === "inflight") return false;
  holds.set(key, { kind: "inflight", until: now() + IN_FLIGHT_MS });
  return true;
}

/**
 * After the request ends, drop the hold so an unpaid deal can still complete
 * Checkout (Upgrade plan, cancel-and-retry). Concurrent starts stay blocked
 * by the in-flight hold until this request finishes.
 */
export function finishBillingPaymentHold(
  key: string,
  statusCode: number,
  _keepPending: boolean,
): void {
  void statusCode;
  void _keepPending;
  holds.delete(key);
}

export function releaseBillingPaymentHold(
  companyId: string,
  dealId: string,
): void {
  const cid = String(companyId ?? "").trim();
  const did = String(dealId ?? "").trim();
  if (!cid || !did) return;
  holds.delete(billingPaymentLockKey(cid, did));
}
