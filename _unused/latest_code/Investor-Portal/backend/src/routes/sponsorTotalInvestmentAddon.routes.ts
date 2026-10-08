import { Router } from "express";
import { getSponsorTotalInvestments } from "../controllers/sponsorTotalInvestment.addon.controller.js";

const router = Router();

router.get("/users/sponsor-total-investments", getSponsorTotalInvestments);

export default router;
