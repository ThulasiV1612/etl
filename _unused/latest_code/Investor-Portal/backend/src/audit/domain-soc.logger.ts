/**
 * Supplemental SOC lines for high-sensitivity domains.
 * Runs alongside global HTTP audit — IDs and counts only, no export bodies or file bytes.
 */

import { socAuditBaseLogger } from "../logging/soc-audit.logger.js";

const membershipDetail = socAuditBaseLogger.child({
  module: "soc-membership-detail",
});

const dealInvestmentDetail = socAuditBaseLogger.child({
  module: "soc-deal-investment-detail",
});

const contactDetail = socAuditBaseLogger.child({
  module: "soc-contact-detail",
});

const documentUploadDetail = socAuditBaseLogger.child({
  module: "soc-document-upload-detail",
});

const privilegedActionDetail = socAuditBaseLogger.child({
  module: "soc-privileged-action-detail",
});

export function logSocMembershipListView(input: {
  actorUserId: string;
  resultCount: number;
  organizationScopeId?: string | null;
}): void {
  membershipDetail.info({
    message: `Members directory viewed (${input.resultCount} members returned)`,
    event: "soc.membership.list_view",
    domain: "membership",
    actorUserId: input.actorUserId,
    resultCount: input.resultCount,
    organizationScopeId: input.organizationScopeId?.trim() || undefined,
  });
}

export function logSocMembershipAdminChange(input: {
  actorUserId: string;
  targetUserId: string;
  auditAction: string;
}): void {
  membershipDetail.info({
    message: `Member record changed by administrator (${input.auditAction})`,
    event: "soc.membership.admin_change",
    domain: "membership",
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
    auditAction: input.auditAction,
  });
}

export function logSocMembershipAuditTrailAccess(input: {
  actorUserId: string;
  targetUserId: string;
}): void {
  membershipDetail.info({
    message: "Per-member admin audit trail accessed",
    event: "soc.membership.audit_trail_access",
    domain: "membership",
    actorUserId: input.actorUserId,
    targetUserId: input.targetUserId,
  });
}

export function logSocMembershipExportNotify(input: {
  actorUserId: string;
  rowCount: number;
  notified: boolean;
}): void {
  membershipDetail.info({
    message: input.notified
      ? `Members export notification sent (${input.rowCount} rows)`
      : `Members export notification attempted (${input.rowCount} rows, delivery skipped or failed)`,
    event: "soc.membership.export_notify",
    domain: "membership",
    actorUserId: input.actorUserId,
    rowCount: input.rowCount,
    notified: input.notified,
  });
}

export function logSocDealInvestmentWrite(input: {
  operation: "create" | "update";
  actorUserId: string;
  dealId: string;
  investmentId: string;
  fundApproved: boolean;
  fundApprovalChanged?: boolean;
  subscriptionDocumentAttached?: boolean;
}): void {
  dealInvestmentDetail.info({
    message:
      input.operation === "create"
        ? "Deal investment / commitment row created"
        : input.fundApprovalChanged
          ? "Deal investment updated (fund approval state changed)"
          : "Deal investment / commitment row updated",
    event:
      input.operation === "create"
        ? "soc.deal.investment.create_detail"
        : "soc.deal.investment.update_detail",
    domain: "deal_investment",
    actorUserId: input.actorUserId,
    dealId: input.dealId,
    investmentId: input.investmentId,
    fundApproved: input.fundApproved,
    fundApprovalChanged: input.fundApprovalChanged ?? undefined,
    subscriptionDocumentAttached: input.subscriptionDocumentAttached ?? undefined,
  });
}

/** Contacts CRM — create / update / status (contact id only; no name/email in log line). */
export function logSocContactWrite(input: {
  operation: "create" | "update" | "status_update";
  actorUserId: string;
  contactId: string;
  status?: string;
}): void {
  contactDetail.info({
    message:
      input.operation === "create"
        ? "CRM contact created"
        : input.operation === "status_update"
          ? "CRM contact status changed"
          : "CRM contact profile updated",
    event:
      input.operation === "create"
        ? "soc.contact.create_detail"
        : input.operation === "status_update"
          ? "soc.contact.status_detail"
          : "soc.contact.update_detail",
    domain: "contact_crm",
    actorUserId: input.actorUserId,
    contactId: input.contactId,
    contactStatus: input.status,
  });
}

/** Bulk CRM directory read (PII-adjacent). */
export function logSocContactDirectoryView(input: {
  actorUserId: string;
  resultCount: number;
}): void {
  contactDetail.info({
    message: `CRM contacts directory viewed (${input.resultCount} contacts)`,
    event: "soc.contact.directory_view",
    domain: "contact_crm",
    actorUserId: input.actorUserId,
    resultCount: input.resultCount,
  });
}

/** Organization tag/list label catalogs (CRM metadata). */
export function logSocContactLabelsRead(input: {
  actorUserId: string;
  organizationId: string;
  kind: "tags" | "lists";
}): void {
  contactDetail.info({
    message:
      input.kind === "tags"
        ? "Organization contact tags catalog accessed"
        : "Organization contact lists catalog accessed",
    event:
      input.kind === "tags"
        ? "soc.contact.labels_tags_view"
        : "soc.contact.labels_lists_view",
    domain: "contact_crm",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
  });
}

/** Company workspace branding image upload (logo / background / icon). */
export function logSocCompanyBrandingUpload(input: {
  actorUserId: string;
  companyId: string;
  assetType: string;
  storage: "cloudinary" | "disk";
}): void {
  documentUploadDetail.info({
    message: `Company branding asset uploaded (${input.assetType}, ${input.storage})`,
    event: "soc.document.company_branding_upload",
    domain: "document_upload",
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    assetType: input.assetType,
    storage: input.storage,
  });
}

/** Deal offering gallery or document batch upload (files stored server-side / paths in DB). */
export function logSocDealOfferingAssetUpload(input: {
  actorUserId: string;
  dealId: string;
  assetKind: "offering_gallery" | "offering_documents";
  fileCount: number;
}): void {
  documentUploadDetail.info({
    message:
      input.assetKind === "offering_gallery"
        ? `Deal offering gallery images uploaded (${input.fileCount} files)`
        : `Deal offering documents uploaded (${input.fileCount} files)`,
    event:
      input.assetKind === "offering_gallery"
        ? "soc.document.deal_offering_gallery_upload"
        : "soc.document.deal_offering_documents_upload",
    domain: "document_upload",
    actorUserId: input.actorUserId,
    dealId: input.dealId,
    fileCount: input.fileCount,
  });
}

/** Workspace CSV export notification pipeline (all export-notify endpoints). */
export function logSocWorkspaceExportNotify(input: {
  exportKind: string;
  actorUserId: string;
  rowCount: number;
  notifyStatus: string;
}): void {
  privilegedActionDetail.info({
    message: `Workspace export notify (${input.exportKind}, status=${input.notifyStatus}, rows=${input.rowCount})`,
    event: "soc.privileged.export_notify",
    domain: "privileged_export",
    exportKind: input.exportKind,
    actorUserId: input.actorUserId,
    rowCount: input.rowCount,
    notifyStatus: input.notifyStatus,
  });
}

/** Destructive or irreversible deal roster changes. */
export function logSocDestructiveDealAction(input: {
  action:
    | "deal.delete"
    | "deal.member_remove"
    | "deal.investor_class_delete";
  actorUserId: string;
  dealId: string;
  resourceId?: string;
}): void {
  const event =
    input.action === "deal.delete"
      ? "soc.privileged.deal_delete"
      : input.action === "deal.member_remove"
        ? "soc.privileged.deal_member_remove"
        : "soc.privileged.deal_investor_class_delete";
  privilegedActionDetail.info({
    message:
      input.action === "deal.delete"
        ? "Deal record deleted"
        : input.action === "deal.member_remove"
          ? "Deal roster member removed"
          : "Deal investor class deleted",
    event,
    domain: "privileged_destructive",
    actorUserId: input.actorUserId,
    dealId: input.dealId,
    resourceId: input.resourceId,
  });
}

/** Mass-email style deal workflow (invitation). */
export function logSocDealMemberInvitationSent(input: {
  actorUserId: string;
  dealId: string;
}): void {
  privilegedActionDetail.info({
    message: "Deal member invitation email sent",
    event: "soc.privileged.deal_member_invitation_email",
    domain: "privileged_notify",
    actorUserId: input.actorUserId,
    dealId: input.dealId,
  });
}
