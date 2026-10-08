import { Router } from "express";
import {
  deleteDealClassSetupClass,
  getDealClassSetup,
  postDealClassSetupClass,
  postDealClassSetupClassDuplicate,
  putDealClassSetup,
  putDealClassSetupClass,
} from "../controllers/classSetup/classSetup.controller.js";

const router = Router();

router.get("/deals/:dealId/class-setup", getDealClassSetup);
router.put("/deals/:dealId/class-setup", putDealClassSetup);
router.post("/deals/:dealId/class-setup/classes", postDealClassSetupClass);
router.put(
  "/deals/:dealId/class-setup/classes/:classId",
  putDealClassSetupClass,
);
router.delete(
  "/deals/:dealId/class-setup/classes/:classId",
  deleteDealClassSetupClass,
);
router.post(
  "/deals/:dealId/class-setup/classes/:classId/duplicate",
  postDealClassSetupClassDuplicate,
);

export default router;
