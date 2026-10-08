import {
  sendWorkspaceExportAuditNotification,
  type WorkspaceExportAuditResult,
} from "../workspace/workspaceExportAudit.service.js";

export type ContactsExportNotifyInput = {
  exporterDisplayName: string;
  exporterEmail: string;
  exporterOrgName: string;
  rowCount: number;
  exportedContactLines?: string[];
};

export type ContactsExportNotifyResult = WorkspaceExportAuditResult;

/** @deprecated use sendWorkspaceExportAuditNotification("contacts", ...) internally */
export async function sendContactsExportNotification(
  input: ContactsExportNotifyInput,
): Promise<ContactsExportNotifyResult> {
  return sendWorkspaceExportAuditNotification("contacts", {
    exporterDisplayName: input.exporterDisplayName,
    exporterEmail: input.exporterEmail,
    exporterOrgName: input.exporterOrgName,
    rowCount: input.rowCount,
    exportedSampleLines: input.exportedContactLines,
  });
}
