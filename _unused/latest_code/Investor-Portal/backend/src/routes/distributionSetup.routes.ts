import { Router } from "express";
import {
  deleteDealPriorDistribution,
  getDealDistributionSetup,
  getDealMyDistributionDetail,
  getDealMyDistributions,
  getMyDistributions,
  patchDealDistributionInvestorPercent,
  postDealDistributionComplete,
  putDealDistributionSetup,
  putDealPriorDistributions,
} from "../controllers/distributionSetup/distributionSetup.controller.js";

const router = Router();

router.get("/investing/my-distributions", getMyDistributions);
router.get(
  "/deals/:dealId/my-distributions/:distributionId",
  getDealMyDistributionDetail,
);
router.get("/deals/:dealId/my-distributions", getDealMyDistributions);
router.get("/deals/:dealId/distribution-setup", getDealDistributionSetup);
router.put("/deals/:dealId/distribution-setup", putDealDistributionSetup);
router.post(
  "/deals/:dealId/distribution-setup/complete",
  postDealDistributionComplete,
);
router.patch(
  "/deals/:dealId/distributions/:distributionId/investor-percent",
  patchDealDistributionInvestorPercent,
);
router.delete(
  "/deals/:dealId/distributions/:distributionId",
  deleteDealPriorDistribution,
);
router.put(
  "/deals/:dealId/distribution-setup/prior-distributions",
  putDealPriorDistributions,
);

export default router;