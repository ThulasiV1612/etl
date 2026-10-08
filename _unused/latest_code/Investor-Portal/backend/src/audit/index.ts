/**
 * SOC HTTP audit — single entry point for middleware and tests.
 *
 * - http-meta: IPs, session, JWT user id, outcome classification
 * - semantic-events: stable event keys + api-* module labels
 * - identifiers: allow-listed body fields
 * - messages: human-readable log lines
 */

export {
  classifyHttpAuditOutcome,
  getAuditClientIp,
  getAuditRequestId,
  getAuditSessionId,
  omitUndefined,
  optionalUserIdFromJwt,
  optionalUserIdFromLocals,
  requestPathOnly,
  resolveAuditUserId,
} from "./http-meta.js";

export {
  deriveAuditModule,
  deriveSemanticAuditEvent,
  normalizeAuditPath,
} from "./semantic-events.js";

export { extractAuditIdentifier } from "./identifiers.js";

export { auditHumanMessage } from "./messages.js";

export {
  logSocCompanyBrandingUpload,
  logSocContactDirectoryView,
  logSocContactLabelsRead,
  logSocContactWrite,
  logSocDealInvestmentWrite,
  logSocDealMemberInvitationSent,
  logSocDealOfferingAssetUpload,
  logSocDestructiveDealAction,
  logSocMembershipAdminChange,
  logSocMembershipAuditTrailAccess,
  logSocMembershipExportNotify,
  logSocMembershipListView,
  logSocWorkspaceExportNotify,
} from "./domain-soc.logger.js";
