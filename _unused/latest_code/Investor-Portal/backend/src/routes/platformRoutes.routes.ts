import { Router } from "express";
import {
  getPlatformFundingHandler,
  getPlatformMetricsHandler,
  getPlatformSignupNotificationsHandler,
  getPlatformUserActivityHandler,
} from "../controllers/platform/platformMetrics.controller.js";

const router = Router();

router.get("/platform/metrics", getPlatformMetricsHandler);
router.get("/platform/metrics/funding", getPlatformFundingHandler);
router.get("/platform/metrics/user-activity", getPlatformUserActivityHandler);
router.get(
  "/platform/signup-notifications",
  getPlatformSignupNotificationsHandler,
);

export default router;
