# Calculation Flow — Distribution Setup

## Overview

Cash moves top-to-bottom through the configured waterfall. If a preferred/CoC hurdle is not fully satisfied, later hurdles and promote receive **$0**.

```
Current Period Cash Available
        ↓
Preferred Return / CoC (actual/365)
        ↓
Capital Return (ROC)
        ↓
GP Catch-up
        ↓
Promote / residual split (blocked if preferred unpaid)
        ↓
Class Distribution totals
        ↓
Investor Distribution (capital or % of class)
        ↓
Manual Adjustments (Other — future)
        ↓
Final Investor Payments
        ↓
Reconciliation
```

## Manual Adjustments (Other)

After the waterfall, optional **Other (manual)** amounts may be applied
(Woodland: Class A +$0.18, Class A+ −$0.08 → net +$0.10).

Final distribution amount = waterfall cash + Other.

## Preferred formula (aligned)

`Preferred due = Capital × Annual rate × Days ÷ 365`

- **Period window** — days = inclusive days in month/quarter/year (clipped by accrual start). Matches Woodland.
- **From accrual start** — days = accrual start → period end. Matches Wildflower CoC.

Investment-level: when funded investors are loaded, dues are summed per investment; otherwise class `actuallyFunded` is used.

## Stop rule

If preferred/CoC tier `due − paid > $0.005`, waterfall stops. Promote stages are skipped.

## Field classification

| Kind | Examples |
|------|----------|
| **Manual input** | Cash available, period, day-count mode, setup name, run name, due overrides |
| **Calculated** | Preferred due (actual/365), paid, shortfall, remaining |
| **Derived** | Investor % from capital, stage-met from IRR/CoC |
| **Output** | Class nets (`perClass`), investor payment lines |

## Code map

| Step | Module |
|------|--------|
| Preferred dues | `engine/preferredDue.ts`, `engine/helpers/formulas.ts` |
| Shortfall / cents | `engine/helpers/rounding.ts`, `utils/distributionSim.ts` |
| Orchestration | `utils/distributionSim.ts` → `runDistributionSim` |
| Investor split | `tabs/distributions/utils/investorDistributionAllocation.ts` |
