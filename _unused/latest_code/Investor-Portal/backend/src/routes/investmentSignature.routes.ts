import { Router } from "express";
import { getInvestmentSignStatusHandler } from "../controllers/investment/investmentSignature.controller.js";

const router = Router();

router.get(
  "/investments/:investmentId/sign-status",
  getInvestmentSignStatusHandler,
);

export default router;
