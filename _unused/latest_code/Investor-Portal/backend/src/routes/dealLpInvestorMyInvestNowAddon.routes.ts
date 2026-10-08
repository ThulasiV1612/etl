import { Router } from "express";
import { patchDealLpInvestorMyInvestNowAddon } from "../controllers/deal/dealLpInvestorMyInvestNow.addon.controller.js";
import { getDealLpInvestorMyInvestNowCommitment } from "../controllers/deal/dealLpInvestorMyInvestNowCommitment.get.controller.js";
import { postDealLpInvestorMyInvestNowEsignSend } from "../controllers/deal/dealLpInvestorMyInvestNowEsignSend.controller.js";

const router = Router();

router.get(
  "/deals/:dealId/lp-investors/my-invest-now-commitment",
  getDealLpInvestorMyInvestNowCommitment,
);

router.patch(
  "/deals/:dealId/lp-investors/my-invest-now-commitment",
  patchDealLpInvestorMyInvestNowAddon,
);

router.post(
  "/deals/:dealId/lp-investors/my-invest-now-esign-send",
  postDealLpInvestorMyInvestNowEsignSend,
);

export default router;
