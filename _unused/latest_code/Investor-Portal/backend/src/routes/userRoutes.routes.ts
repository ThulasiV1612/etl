import { Router } from "express";
import { postSignin } from "../controllers/auth/signin.controller.js";
import {
  getSignupPrefill,
  postSignup,
} from "../controllers/auth/signup.controller.js";
import { getDealInviteVerify } from "../controllers/auth/dealInvite.controller.js";
import { postForgotPassword } from "../controllers/auth/forgotPassword.controller.js";
import { postResetPassword } from "../controllers/auth/resetPassword.controller.js";
import { postInviteUser } from "../controllers/auth/invite.controller.js";
import {
  getMailDefaults,
  getMemberAuditLogs,
  postSendMail,
  getUsers,
  patchUser,
  postMembersExportNotify,
} from "../controllers/userAdmin.controller.js";
import {
  getMyProfile,
  patchMyProfile,
  postChangePassword,
} from "../controllers/auth/account.controller.js";
import {
  postAuthLogout,
  postRefreshTokens,
} from "../controllers/auth/refresh.controller.js";
import {
  postActivityLogout,
  postActivityPageView,
  postEnsureActivitySession,
} from "../controllers/auth/userActivity.controller.js";

const userRoutes = Router();

userRoutes
.post("/auth/signin", postSignin)
.post("/auth/refresh", postRefreshTokens)
.post("/auth/logout", postAuthLogout)
.post("/auth/activity/session", postEnsureActivitySession)
.post("/auth/activity/logout", postActivityLogout)
.post("/auth/activity/page-view", postActivityPageView)
.post("/auth/change-password", postChangePassword)
.get("/auth/me", getMyProfile)
.patch("/auth/me", patchMyProfile)
/** Same handler — some proxies or clients mishandle PATCH; SPA can use POST. */
.post("/auth/me", patchMyProfile)
.get("/auth/deal-invite/verify", getDealInviteVerify)
.get("/auth/signup/prefill", getSignupPrefill)
.post("/auth/signup/:token", postSignup)
.post("/auth/signup", postSignup)
.post("/auth/forgot-password", postForgotPassword)
.post("/auth/reset-password", postResetPassword)
.post("/auth/invite", postInviteUser)
.get("/mail/defaults", getMailDefaults)
.post("/mail/send", postSendMail)
.get("/users", getUsers)
.post("/users/export-notify", postMembersExportNotify)
.get("/users/:userId/audit-logs", getMemberAuditLogs)
.patch("/users/:userId", patchUser);

export default userRoutes;
