import { access } from "node:fs/promises";
import { eq } from "drizzle-orm";
import {
  parseEsignStatusBundle,
  primaryCategoryForSend,
} from "../../constants/deal-investor-esign-status.js";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import { dealLpInvestor } from "../../schema/deal.schema/deal-lp-investor.schema.js";
import {
  resolveEsignTemplateAbsolutePath,
  type EsignTemplateFileRecord,
} from "./dealEsignTemplates.service.js";

export type InvestorFilledTemplateDocument = {
  relativePath: string;
  source: "signed" | "preview";
  sentAt: string;
};

function normalizeStoredDocFileId(fileId: string): string {
  const id = fileId.trim();
  const sep = id.indexOf("::");
  return sep >= 0 ? id.slice(sep + 2).trim() : id;
}

function normalizeUploadRelativePath(rel: string): string {
  return rel.replace(/^\/+/, "").replace(/^uploads\//i, "").trim();
}

async function fileExistsOnDisk(relativePath: string): Promise<boolean> {
  const rel = normalizeUploadRelativePath(relativePath);
  if (!rel) return false;
  try {
    await access(resolveEsignTemplateAbsolutePath(rel));
    return true;
  } catch {
    return false;
  }
}

async function loadDealEsignStatusJsonRows(dealId: string): Promise<string[]> {
  const [investments, roster] = await Promise.all([
    db
      .select({ esignStatusJson: dealInvestment.esignStatusJson })
      .from(dealInvestment)
      .where(eq(dealInvestment.dealId, dealId)),
    db
      .select({ esignStatusJson: dealLpInvestor.esignStatusJson })
      .from(dealLpInvestor)
      .where(eq(dealLpInvestor.dealId, dealId)),
  ]);

  const out: string[] = [];
  for (const row of [...investments, ...roster]) {
    const raw = row.esignStatusJson?.trim();
    if (raw) out.push(raw);
  }
  return out;
}

/**
 * Latest investor-specific PDF for this profile template (merged questionnaire / W-9 preview
 * while pending, or signed PDF after completion).
 */
export async function findLatestInvestorFilledDocumentForTemplate(
  dealId: string,
  templateFile: EsignTemplateFileRecord,
  statusJsonRows?: string[],
): Promise<InvestorFilledTemplateDocument | null> {
  const templateFileId = templateFile.id.trim();
  const categoryId = templateFile.categoryId.trim();
  const blankRel = normalizeUploadRelativePath(templateFile.relativePath ?? "");

  const rows = statusJsonRows ?? (await loadDealEsignStatusJsonRows(dealId));

  let best: InvestorFilledTemplateDocument | null = null;
  let bestSentMs = -1;

  for (const raw of rows) {
    const bundle = parseEsignStatusBundle(raw);
    if (!bundle?.sends.length) continue;

    for (const send of bundle.sends) {
      const sendCat = primaryCategoryForSend(send);
      if (categoryId && sendCat && sendCat !== categoryId) continue;

      const sentAt = send.sentAt?.trim();
      if (!sentAt) continue;
      const sentMs = new Date(sentAt).getTime();
      if (!Number.isFinite(sentMs)) continue;

      const completed = Boolean(send.completedAt?.trim());

      for (const doc of send.documents ?? []) {
        if (normalizeStoredDocFileId(doc.fileId) !== templateFileId) continue;

        const signedRel = doc.signedRelativePath?.trim();
        const previewRel = doc.templateRelativePath?.trim();

        if (completed && signedRel) {
          if (sentMs >= bestSentMs) {
            best = { relativePath: signedRel, source: "signed", sentAt };
            bestSentMs = sentMs;
          }
          continue;
        }

        if (!previewRel) continue;
        const previewNorm = normalizeUploadRelativePath(previewRel);
        if (!previewNorm || previewNorm === blankRel) continue;

        if (sentMs >= bestSentMs) {
          best = { relativePath: previewRel, source: "preview", sentAt };
          bestSentMs = sentMs;
        }
      }
    }
  }

  if (!best) return null;
  if (!(await fileExistsOnDisk(best.relativePath))) return null;
  return best;
}

export type InvestorFilledTemplateMeta = {
  latestInvestorFilled: boolean;
  latestInvestorFilledSource?: "signed" | "preview";
};

/** Attach investor-filled flags for eSign Templates tab (one scan per deal). */
export async function enrichEsignTemplateFilesWithInvestorFilled(
  dealId: string,
  files: EsignTemplateFileRecord[],
): Promise<Array<EsignTemplateFileRecord & InvestorFilledTemplateMeta>> {
  if (files.length === 0) return [];
  const statusRows = await loadDealEsignStatusJsonRows(dealId);
  const out: Array<EsignTemplateFileRecord & InvestorFilledTemplateMeta> = [];

  for (const file of files) {
    const latest = await findLatestInvestorFilledDocumentForTemplate(
      dealId,
      file,
      statusRows,
    );
    out.push({
      ...file,
      latestInvestorFilled: Boolean(latest),
      ...(latest ? { latestInvestorFilledSource: latest.source } : {}),
    });
  }

  return out;
}

export async function groupEsignFilesByCategoryWithInvestorFilled(
  dealId: string,
  files: EsignTemplateFileRecord[],
): Promise<Record<string, Array<EsignTemplateFileRecord & InvestorFilledTemplateMeta>>> {
  const enriched = await enrichEsignTemplateFilesWithInvestorFilled(dealId, files);
  const grouped: Record<
    string,
    Array<EsignTemplateFileRecord & InvestorFilledTemplateMeta>
  > = {};
  for (const file of enriched) {
    const cat = file.categoryId.trim() || "individual";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(file);
  }
  return grouped;
}
