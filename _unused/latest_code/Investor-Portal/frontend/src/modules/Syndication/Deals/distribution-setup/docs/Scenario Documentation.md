# Scenario Documentation — Distribution Waterfall

Reference scenarios from `explaination.txt` (Woodland / Wildflower). Use as acceptance tests when enhancing the engine.

---

## Scenario 1 — Woodland preferred shortfall (multi-class same hurdle)

**Business rule:** Pay Class A (5.5%) and Class A+ (6.5%) preferred in one CoC hurdle. If cash is short, allocate pro-rata by each party’s Required. Do not advance to path/promote splits until the hurdle is fully met.

| Step | Formula | Example |
|------|---------|---------|
| Preferred return | Capital × Rate × Days ÷ 365 | 50,000 × 5.5% × 90/365 = **678.08** |
| Total required | Σ class required | 35,178.85 + 9,616.44 = **44,795.29** |
| Total shortfall | Required − Available | 44,795.29 − 44,790.59 = **4.70** |
| Investor shortfall | (InvestorReq ÷ TotalReq) × Shortfall | (678.08 / 44,795.29) × 4.70 ≈ **0.07** |
| Investor paid | Required − Shortfall | 678.08 − 0.07 = **678.01** |

**Stop:** Hurdle unpaid → 81.21/18.79 path and 70/30 split = $0.

**Manual:** Other adjustments applied after waterfall (e.g. +0.18 / −0.08).

---

## Scenario 2 — Wildflower sequential CoC + path split

**Business rule:** Satisfy Class A1 10% CoC first (actual/365 from accrual start). If unpaid remainder > 0, stop. Else Class A2 7% CoC, then nested path splits (8%/92%).

| Step | Formula | Example |
|------|---------|---------|
| Class raise | Σ investments in class | **200,000** |
| Hurdle required | Capital × 10% × 103/365 | **5,643.84** |
| Paid | min(Available, Required) | **4,999.98** |
| Remaining to satisfy | Required − Paid | **643.86** |
| Distribution % | Investment ÷ Class raise | 100,000 / 200,000 = **50%** |
| Investor payment | Class paid × % | 4,999.98 × 50% = **2,499.99** |

**Stop:** Hurdle 1 unpaid → A2 and GP path split = $0.

---

## Future scenarios (documented, not all coded yet)

1. Pref equity current + accrued portions  
2. Capital return reducing outstanding  
3. GP catch-up to target promote share  
4. Nested path splits as first-class hurdle type  
5. Investment-level actual/365 as default (replacing period ÷ N)  

---

## Acceptance checklist

- [ ] Rafael: Required 678.08, Paid 678.01, Unpaid 0.07  
- [ ] Woodland H1 short 4.70 → later hurdles $0  
- [ ] Wildflower A1 Required 5,643.84, Paid 4,999.98  
- [ ] Parker payment 2,499.99; A2/GP $0  
- [ ] Formula: 200,000 × 10% × 103/365 = 5,643.84  
