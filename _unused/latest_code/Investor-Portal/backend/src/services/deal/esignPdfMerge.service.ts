import { readFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { DropboxSignFormFieldPerDocument } from "../esign/dropboxSign.service.js";
import type { SignFlowField } from "../esign/signflow.service.js";
import {
  esignQuestionnaireSignatureImageExists,
  esignQuestionnaireSignaturePdfExists,
  esignQuestionnaireSignatureUseImageAsset,
  getEsignQuestionnaireSignatureImagePath,
  getEsignQuestionnaireSignaturePdfPath,
} from "../../config/esignQuestionnaire.config.js";
import { esignW9PdfExists, getEsignW9PdfPath } from "../../config/esignW9.config.js";
import {
  buildFilledW9PdfBuffer,
  getEsignW9PageCount,
  type InvestorW9FormData,
} from "./investorW9Form.service.js";

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;

/** Bump when questionnaire page 1 layout changes (stored on template file metadata). */
export const ESIGN_QUESTIONNAIRE_PAGE_LAYOUT_VERSION = 9;

type QuestionnaireSignatureField = {
  label: string;
  apiId: string;
  fieldType: "date_signed" | "signature" | "text";
  fieldHeight: number;
  required: boolean;
};

/** Signature + date on one row; print name/title below. */
const QUESTIONNAIRE_SIGNATURE_DATE_ROW: {
  signature: QuestionnaireSignatureField;
  date: QuestionnaireSignatureField;
} = {
  signature: {
    label: "Authorized Signature",
    apiId: "Signature1",
    fieldType: "signature",
    fieldHeight: 32,
    required: true,
  },
  date: {
    label: "Date",
    apiId: "DateSigned1",
    fieldType: "date_signed",
    fieldHeight: 22,
    required: true,
  },
};

/** Vertical stack (top → bottom) after signature/date row. */
const QUESTIONNAIRE_SIGNATURE_STACK = [
  {
    label: "Print Name",
    apiId: "FullName1",
    fieldType: "text" as const,
    fieldHeight: 22,
    required: true,
  },
  {
    label: "Print Title (if applicable)",
    apiId: "Title1",
    fieldType: "text" as const,
    fieldHeight: 22,
    required: false,
  },
] as const;

const BODY_TOP = 110;
const BODY_LINE_HEIGHT = 14;
/**
 * Wrapped line count for {@link QUESTIONNAIRE_BODY} at 10pt Helvetica / 504pt width.
 * Must stay in sync with pdf-lib wrapping in {@link buildQuestionnaireSignaturePagePdfTextOnly}.
 * Bump {@link ESIGN_QUESTIONNAIRE_PAGE_LAYOUT_VERSION} when body text or margins change.
 */
const QUESTIONNAIRE_BODY_WRAPPED_LINE_COUNT = 7;

const SIGNATURE_MARGIN_X = 72;
const SIGNATURE_LINE_WIDTH = LETTER_WIDTH - SIGNATURE_MARGIN_X * 2;
/** Input box width (underline extends wider on the page). */
const SIGNATURE_FIELD_WIDTH = 248;
const SIGNATURE_DATE_ROW_GAP = 24;
const SIGNATURE_FIELD_WIDTH_IN_ROW = 300;
const DATE_FIELD_WIDTH_IN_ROW =
  SIGNATURE_LINE_WIDTH - SIGNATURE_FIELD_WIDTH_IN_ROW - SIGNATURE_DATE_ROW_GAP;
const SIGNATURE_LABEL_SIZE = 9;
const SIGNATURE_GAP_LABEL_TO_LINE = 5;
const SIGNATURE_GAP_LINE_TO_FIELD = 4;
const SIGNATURE_GAP_BETWEEN_GROUPS = 22;
const SIGNATURE_GAP_BELOW_BODY = 36;

/** Layout + Dropbox Sign coords: origin top-left, y increases downward (page param set). */
type QuestionnaireSignaturePlacement = {
  fieldX: number;
  fieldY: number;
  fieldWidth: number;
  fieldHeight: number;
  lineX: number;
  lineY: number;
  lineWidth: number;
  label: string;
  labelTop: number;
  apiId: string;
  fieldType: QuestionnaireSignatureField["fieldType"];
  required: boolean;
};

export const QUESTIONNAIRE_SIGNATURE_FIELD_LABELS = [
  QUESTIONNAIRE_SIGNATURE_DATE_ROW.signature.label,
  QUESTIONNAIRE_SIGNATURE_DATE_ROW.date.label,
  ...QUESTIONNAIRE_SIGNATURE_STACK.map((f) => f.label),
] as const;

function normalizeQuestionnaireSignatureLabel(label: string): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isQuestionnaireSignatureFieldLabel(label: string): boolean {
  const n = normalizeQuestionnaireSignatureLabel(label);
  return QUESTIONNAIRE_SIGNATURE_FIELD_LABELS.some(
    (known) => normalizeQuestionnaireSignatureLabel(known) === n,
  );
}

function pushQuestionnaireSignaturePlacement(
  placements: QuestionnaireSignaturePlacement[],
  item: QuestionnaireSignatureField,
  labelTop: number,
  fieldX: number,
  fieldWidth: number,
  lineWidth: number,
  fieldTop: number,
  lineY: number,
): void {
  placements.push({
    fieldX,
    fieldY: fieldTop,
    fieldWidth,
    fieldHeight: item.fieldHeight,
    lineX: fieldX,
    lineY,
    lineWidth,
    label: item.label,
    labelTop,
    apiId: item.apiId,
    fieldType: item.fieldType,
    required: item.required,
  });
}

function placementGroupBottom(
  labelTop: number,
  fieldTop: number,
  fieldHeight: number,
): number {
  return Math.max(labelTop + SIGNATURE_LABEL_SIZE, fieldTop + fieldHeight) +
    SIGNATURE_GAP_BETWEEN_GROUPS;
}

function questionnaireBodyEndTop(lineCount: number): number {
  return BODY_TOP + lineCount * BODY_LINE_HEIGHT;
}

let cachedQuestionnaireBodyEndTop: number | null = null;

function resolveQuestionnaireBodyEndTop(): number {
  return (
    cachedQuestionnaireBodyEndTop ??
    questionnaireBodyEndTop(QUESTIONNAIRE_BODY_WRAPPED_LINE_COUNT)
  );
}

function getQuestionnaireSignaturePlacements(): QuestionnaireSignaturePlacement[] {
  return buildQuestionnaireSignaturePlacements(resolveQuestionnaireBodyEndTop());
}

function buildQuestionnaireSignaturePlacements(
  bodyEndTop: number,
): QuestionnaireSignaturePlacement[] {
  let cursorTop = bodyEndTop + SIGNATURE_GAP_BELOW_BODY;
  const placements: QuestionnaireSignaturePlacement[] = [];

  const { signature, date } = QUESTIONNAIRE_SIGNATURE_DATE_ROW;
  const labelTop = cursorTop;
  const lineY = labelTop + SIGNATURE_LABEL_SIZE + SIGNATURE_GAP_LABEL_TO_LINE;
  const fieldTop = lineY + SIGNATURE_GAP_LINE_TO_FIELD;
  const rowHeight = Math.max(signature.fieldHeight, date.fieldHeight);
  const dateFieldX =
    SIGNATURE_MARGIN_X + SIGNATURE_FIELD_WIDTH_IN_ROW + SIGNATURE_DATE_ROW_GAP;

  pushQuestionnaireSignaturePlacement(
    placements,
    signature,
    labelTop,
    SIGNATURE_MARGIN_X,
    SIGNATURE_FIELD_WIDTH_IN_ROW,
    SIGNATURE_FIELD_WIDTH_IN_ROW,
    fieldTop,
    lineY,
  );
  pushQuestionnaireSignaturePlacement(
    placements,
    date,
    labelTop,
    dateFieldX,
    DATE_FIELD_WIDTH_IN_ROW,
    DATE_FIELD_WIDTH_IN_ROW,
    fieldTop + (rowHeight - date.fieldHeight),
    lineY,
  );

  cursorTop = placementGroupBottom(labelTop, fieldTop, rowHeight);

  for (const item of QUESTIONNAIRE_SIGNATURE_STACK) {
    const stackLabelTop = cursorTop;
    const stackLineY =
      stackLabelTop + SIGNATURE_LABEL_SIZE + SIGNATURE_GAP_LABEL_TO_LINE;
    const stackFieldTop = stackLineY + SIGNATURE_GAP_LINE_TO_FIELD;
    pushQuestionnaireSignaturePlacement(
      placements,
      item,
      stackLabelTop,
      SIGNATURE_MARGIN_X,
      SIGNATURE_FIELD_WIDTH,
      SIGNATURE_LINE_WIDTH,
      stackFieldTop,
      stackLineY,
    );
    cursorTop = placementGroupBottom(
      stackLabelTop,
      stackFieldTop,
      item.fieldHeight,
    );
  }

  return placements;
}

function pdfYFromTop(topY: number): number {
  return LETTER_HEIGHT - topY;
}

function drawQuestionnaireSignatureBlock(
  page: PDFPage,
  font: PDFFont,
  bodyEndTop: number,
): void {
  for (const row of buildQuestionnaireSignaturePlacements(bodyEndTop)) {
    page.drawText(row.label, {
      x: row.lineX,
      y: pdfYFromTop(row.labelTop + SIGNATURE_LABEL_SIZE),
      size: SIGNATURE_LABEL_SIZE,
      font,
      color: rgb(0, 0, 0),
    });
    const linePdfY = pdfYFromTop(row.lineY);
    page.drawLine({
      start: { x: row.lineX, y: linePdfY },
      end: { x: row.lineX + row.lineWidth, y: linePdfY },
      thickness: 0.75,
      color: rgb(0, 0, 0),
    });
  }
}

function questionnaireSignFlowFieldType(
  fieldType: QuestionnaireSignatureField["fieldType"],
): string {
  // SignFlow embed uses `date` (Dropbox preset fields use `date_signed`).
  if (fieldType === "date_signed") return "date";
  if (fieldType === "signature") return "signature";
  return "text";
}

function signFlowPercentX(pixelX: number): number {
  return (pixelX / LETTER_WIDTH) * 100;
}

function signFlowPercentY(pixelY: number): number {
  return (pixelY / LETTER_HEIGHT) * 100;
}

function signFlowPercentWidth(pixelWidth: number): number {
  return (pixelWidth / LETTER_WIDTH) * 100;
}

function signFlowPercentHeight(pixelHeight: number): number {
  return (pixelHeight / LETTER_HEIGHT) * 100;
}

/**
 * SignFlow % sizes for investor data text/date fields — matched to questionnaire
 * signature text boxes so filled values align with document body type (~10pt).
 */
export function esignDocumentAlignedTextFieldSize(
  kind: "text" | "date" = "text",
): { width: number; height: number } {
  return {
    width: signFlowPercentWidth(
      kind === "date" ? DATE_FIELD_WIDTH_IN_ROW : SIGNATURE_FIELD_WIDTH,
    ),
    height: signFlowPercentHeight(22),
  };
}

/**
 * Shrink legacy SynX investor-data text/date boxes that used height ≈ 5% (too
 * large vs document body) down to the questionnaire-aligned text height.
 */
export function alignSignFlowTextFieldHeightsToDocument(
  fields: SignFlowField[],
): SignFlowField[] {
  const textH = esignDocumentAlignedTextFieldSize("text").height;
  const dateH = esignDocumentAlignedTextFieldSize("date").height;
  return fields.map((field) => {
    const t = String(field.type ?? "").trim().toLowerCase();
    if (t !== "text" && t !== "date" && t !== "date_signed") return field;
    const h = Number(field.height) || 0;
    // Prior default for "Add field to PDF" was height: 5 (% of page).
    if (h < 4.2 || h > 5.8) return field;
    const height = t === "date" || t === "date_signed" ? dateH : textH;
    return { ...field, height };
  });
}

/** SignFlow fields on questionnaire page 1 — aligned to printed labels/lines. */
export function getInvestorQuestionnaireSignatureSignFlowFields(
  recipientId: string,
  pageOffset = 0,
): SignFlowField[] {
  const placements = getQuestionnaireSignaturePlacements();
  const page = Math.max(1, 1 + Math.max(0, Math.floor(pageOffset)));
  return placements.map((row) => ({
    type: questionnaireSignFlowFieldType(row.fieldType),
    label: row.label,
    x: signFlowPercentX(row.fieldX),
    y: signFlowPercentY(row.fieldY),
    width: signFlowPercentWidth(row.fieldWidth),
    height: signFlowPercentHeight(row.fieldHeight),
    page,
    recipientId,
    required: row.required,
  }));
}

/** Dropbox fields aligned to printed lines (top-left coordinate system). */
export function getInvestorQuestionnaireSignatureFormFields(
  pageOffset = 0,
): DropboxSignFormFieldPerDocument[] {
  const fields = placementsToDropboxFormFields(getQuestionnaireSignaturePlacements());
  if (pageOffset <= 0) {
    if (!cachedQuestionnaireSignatureFormFields) {
      cachedQuestionnaireSignatureFormFields = fields;
    }
    return cachedQuestionnaireSignatureFormFields;
  }
  return fields.map((f) => ({
    ...f,
    page: f.page + pageOffset,
  }));
}

function placementsToDropboxFormFields(
  placements: QuestionnaireSignaturePlacement[],
): DropboxSignFormFieldPerDocument[] {
  return placements.map((row) => ({
    documentIndex: 0,
    apiId: row.apiId,
    type: row.fieldType,
    signer: "0",
    x: row.fieldX,
    y: row.fieldY,
    width: row.fieldWidth,
    height: row.fieldHeight,
    page: 1,
    required: row.required,
    name: row.label,
    placeholder: " ",
  }));
}

/** Bump when questionnaire page layout changes (invalidates in-process cache). */
const QUESTIONNAIRE_SIGNATURE_PAGE_CACHE_KEY = ESIGN_QUESTIONNAIRE_PAGE_LAYOUT_VERSION;
let cachedQuestionnaireSignaturePagePdf: Buffer | null = null;
let cachedQuestionnaireSignatureFormFields: DropboxSignFormFieldPerDocument[] | null =
  null;
let questionnaireSignaturePageCacheKey = 0;

function wrapQuestionnaireBodyLines(
  measureTextWidth: (text: string, fontSize: number) => number,
): string[] {
  const bodySize = 10;
  const marginX = 54;
  const maxWidth = LETTER_WIDTH - marginX * 2;
  const words = QUESTIONNAIRE_BODY.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureTextWidth(candidate, bodySize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

const QUESTIONNAIRE_BODY =
  "By signing below, the undersigned hereby acknowledges that the representations set forth in the Questionnaire are accurate and complete in all respects, and undertakes to immediately notify the Company in writing regarding any material change in the information set forth herein prior to the date and time that the undersigned purchases any Securities. The undersigned understands that the Company and its legal counsel will rely on the accuracy and completeness of these representations for the purpose of determining my suitability as a prospective investor under applicable securities laws, and that a false representation may constitute a violation of law and that any person who suffers damage as a result of a false representation may have a claim against me for damages.";

export function isPdfFileName(name: string): boolean {
  return String(name ?? "").trim().toLowerCase().endsWith(".pdf");
}

export function isPdfUploadFile(file: {
  originalname?: string;
  mimetype?: string;
}): boolean {
  const name = String(file.originalname ?? "").trim().toLowerCase();
  if (name.endsWith(".pdf")) return true;
  const mime = String(file.mimetype ?? "").trim().toLowerCase();
  return mime === "application/pdf";
}

/**
 * Appends all pages of `fw9.pdf` after the main document. Returns the original
 * buffer when W-9 is missing or merge fails (logged).
 */
async function buildQuestionnaireSignaturePagePdfFromPng(
  pngBytes: Buffer,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  const image = await pdf.embedPng(pngBytes);
  /** Fit width; top-align so the title is at the top of page 1 (no blank band above). */
  let scale = LETTER_WIDTH / image.width;
  let drawWidth = image.width * scale;
  let drawHeight = image.height * scale;
  if (drawHeight > LETTER_HEIGHT) {
    scale = LETTER_HEIGHT / image.height;
    drawWidth = image.width * scale;
    drawHeight = image.height * scale;
  }
  const x = (LETTER_WIDTH - drawWidth) / 2;
  const y = LETTER_HEIGHT - drawHeight;
  page.drawImage(image, {
    x,
    y,
    width: drawWidth,
    height: drawHeight,
  });
  return Buffer.from(await pdf.save());
}

/** Questionnaire page: title, legal copy, and printed signature lines (no field boxes in PDF). */
async function buildQuestionnaireSignaturePagePdfTextOnly(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const title = "SIGNATURE PAGE TO INVESTOR QUESTIONNAIRE";
  const titleSize = 12;
  const titleWidth = bold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (LETTER_WIDTH - titleWidth) / 2,
    y: LETTER_HEIGHT - 72,
    size: titleSize,
    font: bold,
    color: rgb(0, 0, 0),
  });

  const bodySize = 10;
  const marginX = 54;
  const lines = wrapQuestionnaireBodyLines((text, size) =>
    regular.widthOfTextAtSize(text, size),
  );

  let bodyEndTop = BODY_TOP;
  for (const textLine of lines) {
    page.drawText(textLine, {
      x: marginX,
      y: pdfYFromTop(bodyEndTop + bodySize),
      size: bodySize,
      font: regular,
      color: rgb(0, 0, 0),
    });
    bodyEndTop += BODY_LINE_HEIGHT;
  }

  cachedQuestionnaireBodyEndTop = bodyEndTop;
  drawQuestionnaireSignatureBlock(page, regular, bodyEndTop);
  cachedQuestionnaireSignatureFormFields = placementsToDropboxFormFields(
    buildQuestionnaireSignaturePlacements(bodyEndTop),
  );

  return Buffer.from(await pdf.save());
}

/** Loads the standard investor questionnaire signature page (single-page PDF). */
export async function loadInvestorQuestionnaireSignaturePagePdf(): Promise<Buffer | null> {
  if (
    cachedQuestionnaireSignaturePagePdf &&
    questionnaireSignaturePageCacheKey === QUESTIONNAIRE_SIGNATURE_PAGE_CACHE_KEY
  ) {
    return cachedQuestionnaireSignaturePagePdf;
  }
  cachedQuestionnaireSignaturePagePdf = null;
  cachedQuestionnaireSignatureFormFields = null;
  cachedQuestionnaireBodyEndTop = null;

  if (esignQuestionnaireSignatureUseImageAsset()) {
    if (esignQuestionnaireSignaturePdfExists()) {
      cachedQuestionnaireSignaturePagePdf = await readFile(
        getEsignQuestionnaireSignaturePdfPath(),
      );
      questionnaireSignaturePageCacheKey = QUESTIONNAIRE_SIGNATURE_PAGE_CACHE_KEY;
      return cachedQuestionnaireSignaturePagePdf;
    }

    if (esignQuestionnaireSignatureImageExists()) {
      const pngBytes = await readFile(getEsignQuestionnaireSignatureImagePath());
      cachedQuestionnaireSignaturePagePdf =
        await buildQuestionnaireSignaturePagePdfFromPng(pngBytes);
      questionnaireSignaturePageCacheKey = QUESTIONNAIRE_SIGNATURE_PAGE_CACHE_KEY;
      return cachedQuestionnaireSignaturePagePdf;
    }

    console.warn(
      "[esign] ESIGN_QUESTIONNAIRE_SIGNATURE_USE_ASSET is set but no PNG/PDF found — using text-only page",
    );
  }

  cachedQuestionnaireSignaturePagePdf =
    await buildQuestionnaireSignaturePagePdfTextOnly();
  questionnaireSignaturePageCacheKey = QUESTIONNAIRE_SIGNATURE_PAGE_CACHE_KEY;
  return cachedQuestionnaireSignaturePagePdf;
}

/**
 * Prepends the investor questionnaire signature page as page 1.
 * Main document pages follow; W-9 (if any) should still be appended afterward.
 */
/** Prefix PDF(s) in order before `mainPdf`. */
/**
 * Inserts PDF(s) immediately after `afterPageIndex` (0-based) of `mainPdf`, then appends
 * the remaining pages of `mainPdf`. Used to place investor answer pages after the
 * questionnaire signature page (page 1) so Dropbox template page 1 stays aligned.
 */
export async function insertPdfBuffersAfterPage(
  mainPdf: Buffer,
  afterPageIndex: number,
  insertBuffers: Buffer[],
): Promise<{ buffer: Buffer; inserted: boolean; insertPageCount: number }> {
  const toInsert = insertBuffers.filter((b) => b?.length);
  if (!toInsert.length) {
    return { buffer: mainPdf, inserted: false, insertPageCount: 0 };
  }

  try {
    const mainDoc = await PDFDocument.load(mainPdf, { ignoreEncryption: true });
    const merged = await PDFDocument.create();
    const indices = mainDoc.getPageIndices();
    const splitAt = Math.max(
      0,
      Math.min(Math.floor(afterPageIndex), indices.length - 1),
    );

    const beforeIndices = indices.slice(0, splitAt + 1);
    if (beforeIndices.length) {
      const beforePages = await merged.copyPages(mainDoc, beforeIndices);
      for (const page of beforePages) merged.addPage(page);
    }

    let insertPageCount = 0;
    for (const buf of toInsert) {
      const insertDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
      insertPageCount += insertDoc.getPageCount();
      const insertPages = await merged.copyPages(
        insertDoc,
        insertDoc.getPageIndices(),
      );
      for (const page of insertPages) merged.addPage(page);
    }

    const afterIndices = indices.slice(splitAt + 1);
    if (afterIndices.length) {
      const afterPages = await merged.copyPages(mainDoc, afterIndices);
      for (const page of afterPages) merged.addPage(page);
    }

    return {
      buffer: Buffer.from(await merged.save()),
      inserted: true,
      insertPageCount,
    };
  } catch (err) {
    console.error("[esign] Failed to insert PDF buffers after page:", err);
    return { buffer: mainPdf, inserted: false, insertPageCount: 0 };
  }
}

export async function prependPdfBuffers(
  mainPdf: Buffer,
  prefixBuffers: Buffer[],
): Promise<{ buffer: Buffer; prepended: boolean }> {
  const prefixes = prefixBuffers.filter((b) => b?.length);
  if (!prefixes.length) {
    return { buffer: mainPdf, prepended: false };
  }

  try {
    const merged = await PDFDocument.create();
    for (const prefix of prefixes) {
      const prefixDoc = await PDFDocument.load(prefix, {
        ignoreEncryption: true,
      });
      const pages = await merged.copyPages(
        prefixDoc,
        prefixDoc.getPageIndices(),
      );
      for (const page of pages) merged.addPage(page);
    }

    const mainDoc = await PDFDocument.load(mainPdf, { ignoreEncryption: true });
    const mainPages = await merged.copyPages(mainDoc, mainDoc.getPageIndices());
    for (const page of mainPages) merged.addPage(page);

    return { buffer: Buffer.from(await merged.save()), prepended: true };
  } catch (err) {
    console.error("[esign] Failed to prepend PDF buffers:", err);
    return { buffer: mainPdf, prepended: false };
  }
}

export async function prependInvestorQuestionnaireSignaturePage(
  mainPdf: Buffer,
): Promise<{ buffer: Buffer; prepended: boolean }> {
  const signaturePage = await loadInvestorQuestionnaireSignaturePagePdf();
  if (!signaturePage) {
    console.warn(
      "[esign] Could not load questionnaire signature page — uploading without prepend",
    );
    return { buffer: mainPdf, prepended: false };
  }

  return prependPdfBuffers(mainPdf, [signaturePage]);
}

async function loadW9AppendixBytes(
  w9FormData?: InvestorW9FormData | null,
): Promise<Buffer | null> {
  if (!esignW9PdfExists()) return null;
  if (w9FormData) {
    try {
      return await buildFilledW9PdfBuffer(w9FormData);
    } catch (err) {
      console.error("[esign] Failed to build filled W-9 PDF:", err);
    }
  }
  return readFile(getEsignW9PdfPath());
}

export async function appendW9ToPdfBuffer(
  mainPdf: Buffer,
  w9FormData?: InvestorW9FormData | null,
): Promise<{ buffer: Buffer; w9Appended: boolean }> {
  if (!esignW9PdfExists()) {
    console.warn(
      "[esign] W-9 PDF not found at",
      getEsignW9PdfPath(),
      "— uploading without W-9 appendix",
    );
    return { buffer: mainPdf, w9Appended: false };
  }

  try {
    const w9Bytes = await loadW9AppendixBytes(w9FormData);
    if (!w9Bytes) return { buffer: mainPdf, w9Appended: false };

    const merged = await PDFDocument.create();
    const mainDoc = await PDFDocument.load(mainPdf, { ignoreEncryption: true });
    const w9Doc = await PDFDocument.load(w9Bytes, { ignoreEncryption: true });

    const mainPages = await merged.copyPages(mainDoc, mainDoc.getPageIndices());
    for (const page of mainPages) merged.addPage(page);

    const w9Pages = await merged.copyPages(w9Doc, w9Doc.getPageIndices());
    for (const page of w9Pages) merged.addPage(page);

    const out = Buffer.from(await merged.save());
    return { buffer: out, w9Appended: true };
  } catch (err) {
    console.error("[esign] Failed to append W-9 PDF:", err);
    return { buffer: mainPdf, w9Appended: false };
  }
}

/**
 * Swaps the trailing W-9 appendix pages on a merged template PDF with a filled copy.
 */
export async function replaceW9AppendixWithFilled(
  mergedPdf: Buffer,
  w9FormData: InvestorW9FormData,
): Promise<Buffer> {
  const w9PageCount = await getEsignW9PageCount();
  if (w9PageCount <= 0) return mergedPdf;

  try {
    const filledW9 = await buildFilledW9PdfBuffer(w9FormData);
    const doc = await PDFDocument.load(mergedPdf, { ignoreEncryption: true });
    const total = doc.getPageCount();
    if (total < w9PageCount) {
      return (await appendW9ToPdfBuffer(mergedPdf, w9FormData)).buffer;
    }

    const mainEnd = total - w9PageCount;
    const out = await PDFDocument.create();
    const mainPages = await out.copyPages(
      doc,
      Array.from({ length: mainEnd }, (_, i) => i),
    );
    for (const page of mainPages) out.addPage(page);

    const w9Doc = await PDFDocument.load(filledW9, { ignoreEncryption: true });
    const w9Pages = await out.copyPages(w9Doc, w9Doc.getPageIndices());
    for (const page of w9Pages) out.addPage(page);

    return Buffer.from(await out.save());
  } catch (err) {
    console.error("[esign] replaceW9AppendixWithFilled failed:", err);
    return mergedPdf;
  }
}
