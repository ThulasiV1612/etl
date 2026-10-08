import { Router } from "express";
import {
  deleteMyProfileBookProfile,
  getMyProfileBook,
  patchMyProfileBookAddress,
  patchMyProfileBookBeneficiary,
  patchMyProfileBookProfile,
  postMyProfileBookAddress,
  postMyProfileBookBeneficiary,
  postMyProfileBookProfile,
  putMyProfileBookAddress,
  putMyProfileBookBeneficiary,
  putMyProfileBookProfile,
} from "../controllers/investing/investingProfileBook.controller.js";

const router = Router();

router.get("/investing/my-profile-book", getMyProfileBook);
router.post("/investing/my-profile-book/profiles", postMyProfileBookProfile);
router.patch(
  "/investing/my-profile-book/profiles/:id",
  patchMyProfileBookProfile,
);
router.delete(
  "/investing/my-profile-book/profiles/:id",
  deleteMyProfileBookProfile,
);
router.put("/investing/my-profile-book/profiles/:id", putMyProfileBookProfile);
router.post("/investing/my-profile-book/beneficiaries", postMyProfileBookBeneficiary);
router.patch(
  "/investing/my-profile-book/beneficiaries/:id",
  patchMyProfileBookBeneficiary,
);
router.put(
  "/investing/my-profile-book/beneficiaries/:id",
  putMyProfileBookBeneficiary,
);
router.post("/investing/my-profile-book/addresses", postMyProfileBookAddress);
router.patch(
  "/investing/my-profile-book/addresses/:id",
  patchMyProfileBookAddress,
);
router.put("/investing/my-profile-book/addresses/:id", putMyProfileBookAddress);

export default router;
