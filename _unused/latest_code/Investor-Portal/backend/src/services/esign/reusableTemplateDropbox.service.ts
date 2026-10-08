import { readFile } from "node:fs/promises";
import { getDropboxSignConfig } from "../../config/dropboxSign.config.js";
import {
  createEmbeddedTemplateDraft,
  tryGetEmbeddedTemplateEditUrl,
  waitForEmbeddedTemplateEditUrl,
} from "./dropboxSign.service.js";
import {
  getReusableTemplateForViewer,
  resolveReusableTemplateAbsolutePath,
  updateReusableTemplateDraftState,
} from "./reusableTemplate.service.js";

/**
 * Starts or resumes Dropbox Sign embedded template editor for a reusable template row.
 */
export async function startReusableTemplateEmbeddedDraft(params: {
  portalTemplateId: string;
  viewerUserId: string;
  viewerRole?: string | null;
  requestedOrganizationId?: string | null;
  title?: string;
}): Promise<{
  editUrl: string;
  templateId: string;
  expiresAt: number;
  clientId: string;
  testMode: boolean;
}> {
  const cfg = getDropboxSignConfig();
  if (!cfg) {
    throw new Error(
      "Dropbox Sign is not configured. Add DROPBOX_SIGN_API_KEY and DROPBOX_SIGN_CLIENT_ID to backend/.env",
    );
  }

  const row = await getReusableTemplateForViewer(
    params.portalTemplateId,
    params.viewerUserId,
    params.viewerRole,
    params.requestedOrganizationId,
  );
  if (!row) {
    throw new Error("Template not found");
  }
  if (!row.relativePath?.trim()) {
    throw new Error("Template has no uploaded document");
  }

  const title =
    params.title?.trim() ||
    row.name?.trim() ||
    row.originalName?.replace(/\.pdf$/i, "") ||
    "Reusable template";

  const absPath = resolveReusableTemplateAbsolutePath(row.relativePath);
  const fileBuffer = await readFile(absPath);

  const storedTemplateId = row.dropboxSignTemplateId?.trim();
  if (storedTemplateId) {
    let existing: { editUrl: string; expiresAt: number } | null = null;
    try {
      existing = await tryGetEmbeddedTemplateEditUrl(storedTemplateId);
      if (!existing) {
        existing = await waitForEmbeddedTemplateEditUrl(storedTemplateId, {
          maxAttempts: 5,
          delayMs: 1500,
        }).catch(() => null);
      }
    } catch (err) {
      console.warn(
        `[esign] Could not resume Dropbox template ${storedTemplateId}; creating a new embedded draft:`,
        err,
      );
      existing = null;
    }
    if (existing) {
      return {
        editUrl: existing.editUrl,
        templateId: storedTemplateId,
        expiresAt: existing.expiresAt,
        clientId: cfg.clientId,
        testMode: cfg.testMode,
      };
    }
    console.warn(
      `[esign] Dropbox template ${storedTemplateId} not found for portal template ${params.portalTemplateId}; creating new embedded draft`,
    );
  }

  const draft = await createEmbeddedTemplateDraft({
    title,
    fileBuffer,
    fileName: row.originalName?.trim() || "template.pdf",
    subject: "Please review and sign",
    message: "Reusable document template",
    signerRoles: normalizeRoles(row.roles),
  });

  await updateReusableTemplateDraftState(params.portalTemplateId, {
    dropboxSignTemplateId: draft.templateId,
    dropboxSignStatus: "draft",
  });

  return {
    editUrl: draft.editUrl,
    templateId: draft.templateId,
    expiresAt: draft.expiresAt,
    clientId: cfg.clientId,
    testMode: cfg.testMode,
  };
}

function normalizeRoles(
  roles: { name: string; order: number }[] | null | undefined,
): { name: string; order: number }[] | undefined {
  if (!roles?.length) return undefined;
  return roles.map((r, i) => ({
    name: r.name?.trim() || `Signer ${i + 1}`,
    order: typeof r.order === "number" ? r.order : i,
  }));
}
