import "../src/env.bootstrap.js";
import Stripe from "stripe";
import {
  getStripeConfig,
  STRIPE_BILLING_PLAN_IDS,
  STRIPE_BILLING_SEAT_BANDS,
  priceEnvNameFor,
} from "../src/config/stripe.config.js";

async function main() {
  const cfg = getStripeConfig();
  if (!cfg) {
    console.log("Stripe not configured");
    process.exit(1);
  }

  const stripe = new Stripe(cfg.secretKey, { apiVersion: "2026-06-24.dahlia" });
  const rows: Array<{
    env: string;
    ok: boolean;
    err?: string;
    active?: boolean;
    livemode?: boolean;
    idTail?: string;
  }> = [];

  for (const plan of STRIPE_BILLING_PLAN_IDS) {
    for (const seat of STRIPE_BILLING_SEAT_BANDS) {
      for (const cycle of ["monthly", "annual"] as const) {
        const id = cfg.prices[plan][seat][cycle];
        const env = priceEnvNameFor(plan, cycle, seat);
        if (!id) {
          rows.push({ env, ok: false, err: "missing env" });
          continue;
        }
        try {
          const p = await stripe.prices.retrieve(id);
          rows.push({
            env,
            ok: true,
            active: p.active,
            livemode: p.livemode,
            idTail: id.slice(-8),
          });
        } catch (e) {
          rows.push({
            env,
            ok: false,
            err: e instanceof Error ? e.message : String(e),
            idTail: id.slice(-8),
          });
        }
      }
    }
  }

  for (const r of rows) {
    if (r.ok) {
      console.log(
        `OK  ${r.env} …${r.idTail} active=${r.active} live=${r.livemode}`,
      );
    } else {
      console.log(`BAD ${r.env} …${r.idTail ?? "?"} ${r.err}`);
    }
  }
  console.log(
    `Summary: OK=${rows.filter((r) => r.ok).length} BAD=${rows.filter((r) => !r.ok).length}`,
  );
}

void main();
