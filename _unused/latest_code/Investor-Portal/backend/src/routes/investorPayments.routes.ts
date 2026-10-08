import { Router } from "express";
// Investor contributions: workflow — Stripe Checkout disabled for now
// import {
//   postInvestorInvestmentCheckout,
//   postInvestorInvestmentCheckoutSync,
// } from "../controllers/payments/investorCheckout.controller.js";
import {
  getDealDistributionFundingOnboardingStatus,
  getDistributionPayouts,
  getInvestorConnectOnboardingStatus,
  getInvestorSharedConnectBanks,
  postDealDistributionFundingOnboarding,
  postDistributionPayouts,
  postInvestorConnectAttachBank,
  postInvestorConnectOnboarding,
} from "../controllers/payments/investorDistributionPayout.controller.js";

const router = Router();

// Investor contributions: workflow — Stripe Checkout disabled for now
// router.post(
//   "/deals/:dealId/investments/:investmentId/checkout",
//   postInvestorInvestmentCheckout,
// );
// router.post(
//   "/investing/investment-payments/sync-checkout",
//   postInvestorInvestmentCheckoutSync,
// );
router.get(
  "/investing/stripe-connect/banks",
  getInvestorSharedConnectBanks,
);
router.post(
  "/investing/profiles/:profileId/stripe-connect/onboarding",
  postInvestorConnectOnboarding,
);
router.get(
  "/investing/profiles/:profileId/stripe-connect/status",
  getInvestorConnectOnboardingStatus,
);
router.post(
  "/investing/profiles/:profileId/stripe-connect/attach",
  postInvestorConnectAttachBank,
);
router.post(
  "/deals/:dealId/distribution-funding/onboarding",
  postDealDistributionFundingOnboarding,
);
router.get(
  "/deals/:dealId/distribution-funding/status",
  getDealDistributionFundingOnboardingStatus,
);
router.get(
  "/deals/:dealId/distributions/:distributionId/payouts",
  getDistributionPayouts,
);
router.post(
  "/deals/:dealId/distributions/:distributionId/payouts",
  postDistributionPayouts,
);

export default router;
