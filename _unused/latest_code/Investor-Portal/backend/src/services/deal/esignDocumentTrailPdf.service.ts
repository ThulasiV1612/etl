import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { getActiveEsignProvider } from "../../config/esignProvider.config.js";
import type { StoredDealInvestorEsignSend } from "../../constants/deal-investor-esign-status.js";
import {
  getSignatureRequestDetail,
  type DropboxSignatureRequestDetail,
} from "../esign/dropboxSign.service.js";
import {
  getSignFlowDocument,
  type SignFlowDocument,
} from "../esign/signflow.service.js";
import { getAddDealFormById } from "./dealForm.service.js";

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const MARGIN_X = 36;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 48;
const CONTENT_WIDTH = LETTER_WIDTH - MARGIN_X * 2;
const COL_WIDTH = CONTENT_WIDTH / 2 - 8;
const TIME_ZONE = "America/New_York";
const TIME_ZONE_LABEL = "(UTC-05:00) Eastern Time (US & Canada)";
const PLATFORM_NAME = "Investor Portal";

const LABEL_SIZE = 8;
const VALUE_SIZE = 8.5;
const TITLE_SIZE = 14;
const SECTION_BAR_HEIGHT = 15;
const LINE_GAP = 3;

export type EsignDocumentTrailSigner = {
  name: string;
  email: string;
  roleLabel: string;
  securityLevel: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  signatureLabel: string;
};

export type EsignDocumentTrailSummaryEvent = {
  label: string;
  status: string;
  timestamp: string | null;
};

/** Investor portal stores investor-facing PDFs — not sponsor envelope audit trails. */
export type EsignDocumentTrailAudience = "investor" | "full";

export type EsignDocumentTrailModel = {
  envelopeId: string;
  subject: string;
  status: string;
  documentPages: number;
  signatureCount: number;
  certificatePages: number;
  initialsCount: number;
  autoNav: string;
  envelopeIdStamping: string;
  timeZoneLabel: string;
  originatorName: string;
  originatorEmail: string;
  originatorAddress: string;
  originatorIp: string;
  recordStatus: string;
  recordHolderName: string;
  recordHolderEmail: string;
  recordLocation: string;
  recordTimestamp: string | null;
  signers: EsignDocumentTrailSigner[];
  summaryEvents: EsignDocumentTrailSummaryEvent[];
};

type PdfWriter = {
  page: PDFPage;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  cursorTop: number;
  addPage: () => void;
};

function pdfYFromTop(topY: number): number {
  return LETTER_HEIGHT - topY;
}

function formatTrailTimestamp(iso: string | null | undefined): string {
  const s = iso?.trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d);
}

function clipText(value: string | null | undefined, max = 120): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function wrapTextLines(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (!words.length || words[0] === "") return [""];
  const lines: string[] = [];
  let line = words[0]!;
  for (let i = 1; i < words.length; i += 1) {
    const next = `${line} ${words[i]!}`;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = words[i]!;
    }
  }
  lines.push(line);
  return lines;
}

async function createWriter(pdf: PDFDocument): Promise<PdfWriter> {
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const state = {
    page: pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]),
    fontRegular,
    fontBold,
    cursorTop: MARGIN_TOP,
    addPage() {
      state.page = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
      state.cursorTop = MARGIN_TOP;
    },
  };
  return state;
}

function ensureSpace(writer: PdfWriter, neededHeight: number): void {
  const maxY = LETTER_HEIGHT - MARGIN_BOTTOM;
  if (writer.cursorTop + neededHeight <= maxY) return;
  writer.addPage();
}

function drawTextAt(
  writer: PdfWriter,
  text: string,
  x: number,
  topY: number,
  size: number,
  font: PDFFont,
  maxWidth?: number,
): number {
  const rawLines = text.split("\n");
  const lines: string[] = [];
  for (const raw of rawLines) {
    if (maxWidth) {
      lines.push(...wrapTextLines(raw, font, size, maxWidth));
    } else {
      lines.push(raw);
    }
  }
  let y = topY;
  for (const line of lines) {
    writer.page.drawText(line, {
      x,
      y: pdfYFromTop(y + size),
      size,
      font,
      color: rgb(0, 0, 0),
    });
    y += size + LINE_GAP;
  }
  return y;
}

function drawSectionBar(writer: PdfWriter, title: string): void {
  ensureSpace(writer, SECTION_BAR_HEIGHT + 8);
  const top = writer.cursorTop;
  writer.page.drawRectangle({
    x: MARGIN_X,
    y: pdfYFromTop(top + SECTION_BAR_HEIGHT),
    width: CONTENT_WIDTH,
    height: SECTION_BAR_HEIGHT,
    color: rgb(0.86, 0.86, 0.86),
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.5,
  });
  writer.page.drawText(title, {
    x: MARGIN_X + 5,
    y: pdfYFromTop(top + 11),
    size: 9,
    font: writer.fontBold,
    color: rgb(0, 0, 0),
  });
  writer.cursorTop = top + SECTION_BAR_HEIGHT + 8;
}

function drawLabelValueBlock(
  writer: PdfWriter,
  x: number,
  label: string,
  value: string,
  maxWidth: number,
): number {
  let y = writer.cursorTop;
  y = drawTextAt(writer, label, x, y, LABEL_SIZE, writer.fontBold, maxWidth);
  y = drawTextAt(writer, value || "—", x, y + 1, VALUE_SIZE, writer.fontRegular, maxWidth);
  return y + 6;
}

function drawCertificateHeader(writer: PdfWriter, model: EsignDocumentTrailModel): void {
  const title = "Certificate Of Completion";
  const titleWidth = writer.fontBold.widthOfTextAtSize(title, TITLE_SIZE);
  writer.page.drawText(title, {
    x: (LETTER_WIDTH - titleWidth) / 2,
    y: pdfYFromTop(writer.cursorTop + TITLE_SIZE),
    size: TITLE_SIZE,
    font: writer.fontBold,
    color: rgb(0, 0, 0),
  });
  writer.cursorTop += TITLE_SIZE + 16;

  const leftX = MARGIN_X;
  const rightX = MARGIN_X + CONTENT_WIDTH / 2 + 8;
  const startTop = writer.cursorTop;

  const leftFields: Array<[string, string]> = [
    ["Envelope Id:", model.envelopeId],
    ["Subject:", model.subject],
    ["Source Envelope:", ""],
    ["Document Pages:", String(model.documentPages)],
    ["Signatures:", String(model.signatureCount)],
    ["Certificate Pages:", String(model.certificatePages)],
    ["Initials:", String(model.initialsCount)],
    ["AutoNav:", model.autoNav],
    ["EnvelopeId Stamping:", model.envelopeIdStamping],
    ["Time Zone:", model.timeZoneLabel],
  ];
  const rightFields: Array<[string, string]> = [
    ["Status:", model.status],
    ["Envelope Originator:", model.originatorName],
    ["", model.originatorAddress],
    [`Email: ${model.originatorEmail}`, ""],
    [`IP Address: ${model.originatorIp}`, ""],
  ];

  let leftY = startTop;
  for (const [label, value] of leftFields) {
    if (!label && !value) continue;
    if (label && !value) {
      leftY = drawTextAt(writer, label, leftX, leftY, VALUE_SIZE, writer.fontRegular, COL_WIDTH);
      continue;
    }
    leftY = drawLabelValueBlock(writer, leftX, label, value, COL_WIDTH);
  }

  let rightY = startTop;
  for (const [label, value] of rightFields) {
    if (!label && !value) continue;
    if (label.startsWith("Email:") || label.startsWith("IP Address:")) {
      rightY = drawTextAt(writer, label, rightX, rightY, VALUE_SIZE, writer.fontRegular, COL_WIDTH);
      continue;
    }
    rightY = drawLabelValueBlock(writer, rightX, label, value, COL_WIDTH);
  }

  writer.cursorTop = Math.max(leftY, rightY) + 4;
}

function drawRecordTracking(writer: PdfWriter, model: EsignDocumentTrailModel): void {
  drawSectionBar(writer, "Record Tracking");
  const col1 = MARGIN_X;
  const col2 = MARGIN_X + 130;
  const col3 = MARGIN_X + 280;
  const col4 = MARGIN_X + 380;
  const headerTop = writer.cursorTop;
  drawTextAt(writer, "Status:", col1, headerTop, LABEL_SIZE, writer.fontBold);
  drawTextAt(writer, "Holder:", col2, headerTop, LABEL_SIZE, writer.fontBold);
  drawTextAt(writer, "Location:", col3, headerTop, LABEL_SIZE, writer.fontBold);
  drawTextAt(writer, "Timestamp:", col4, headerTop, LABEL_SIZE, writer.fontBold);
  const rowTop = headerTop + LABEL_SIZE + 6;
  drawTextAt(writer, model.recordStatus, col1, rowTop, VALUE_SIZE, writer.fontRegular);
  drawTextAt(
    writer,
    `${model.recordHolderName}\n${model.recordHolderEmail}`,
    col2,
    rowTop,
    VALUE_SIZE,
    writer.fontRegular,
    140,
  );
  drawTextAt(writer, model.recordLocation, col3, rowTop, VALUE_SIZE, writer.fontRegular);
  drawTextAt(
    writer,
    formatTrailTimestamp(model.recordTimestamp),
    col4,
    rowTop,
    VALUE_SIZE,
    writer.fontRegular,
  );
  writer.cursorTop = rowTop + 28;
}

function drawSignerEvents(writer: PdfWriter, model: EsignDocumentTrailModel): void {
  drawSectionBar(writer, "Signer Events");
  const colSigner = MARGIN_X;
  const colSignature = MARGIN_X + 250;
  const colTimestamp = MARGIN_X + 410;
  const headerTop = writer.cursorTop;
  drawTextAt(writer, "Signer Events", colSigner, headerTop, LABEL_SIZE, writer.fontBold);
  drawTextAt(writer, "Signature", colSignature, headerTop, LABEL_SIZE, writer.fontBold);
  drawTextAt(writer, "Timestamp", colTimestamp, headerTop, LABEL_SIZE, writer.fontBold);
  writer.cursorTop = headerTop + LABEL_SIZE + 8;

  for (const signer of model.signers) {
    ensureSpace(writer, 72);
    const blockTop = writer.cursorTop;
    const signerLines = [
      signer.name,
      signer.email,
      signer.roleLabel,
      signer.securityLevel,
    ].filter(Boolean);
    drawTextAt(
      writer,
      signerLines.join("\n"),
      colSigner,
      blockTop,
      VALUE_SIZE,
      writer.fontRegular,
      230,
    );
    drawTextAt(
      writer,
      signer.signatureLabel,
      colSignature,
      blockTop,
      VALUE_SIZE,
      writer.fontRegular,
      140,
    );
    const tsLines = [
      signer.sentAt ? `Sent: ${formatTrailTimestamp(signer.sentAt)}` : "",
      signer.viewedAt ? `Viewed: ${formatTrailTimestamp(signer.viewedAt)}` : "",
      signer.signedAt ? `Signed: ${formatTrailTimestamp(signer.signedAt)}` : "",
    ].filter(Boolean);
    drawTextAt(
      writer,
      tsLines.join("\n"),
      colTimestamp,
      blockTop,
      VALUE_SIZE,
      writer.fontRegular,
      150,
    );
    writer.cursorTop = blockTop + 64;
  }
  writer.cursorTop += 4;
}

function drawSummaryEvents(writer: PdfWriter, model: EsignDocumentTrailModel): void {
  if (!model.summaryEvents.length) return;
  drawSectionBar(writer, "Envelope Summary Events");
  const colEvent = MARGIN_X;
  const colStatus = MARGIN_X + 250;
  const colTimestamp = MARGIN_X + 410;
  const headerTop = writer.cursorTop;
  drawTextAt(writer, "Envelope Summary Events", colEvent, headerTop, LABEL_SIZE, writer.fontBold);
  drawTextAt(writer, "Status", colStatus, headerTop, LABEL_SIZE, writer.fontBold);
  drawTextAt(writer, "Timestamps", colTimestamp, headerTop, LABEL_SIZE, writer.fontBold);
  writer.cursorTop = headerTop + LABEL_SIZE + 8;

  for (const event of model.summaryEvents) {
    ensureSpace(writer, 20);
    const rowTop = writer.cursorTop;
    drawTextAt(writer, event.label, colEvent, rowTop, VALUE_SIZE, writer.fontRegular, 230);
    drawTextAt(writer, event.status, colStatus, rowTop, VALUE_SIZE, writer.fontRegular, 140);
    drawTextAt(
      writer,
      formatTrailTimestamp(event.timestamp),
      colTimestamp,
      rowTop,
      VALUE_SIZE,
      writer.fontRegular,
      150,
    );
    writer.cursorTop = rowTop + 16;
  }
}

export async function buildEsignDocumentTrailPdfBuffer(
  model: EsignDocumentTrailModel,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const writer = await createWriter(pdf);
  drawCertificateHeader(writer, model);
  drawRecordTracking(writer, model);
  drawSignerEvents(writer, model);
  drawSummaryEvents(writer, model);
  return Buffer.from(await pdf.save());
}

function signFlowRoleLabel(role: string | undefined): string {
  const r = String(role ?? "").trim().toLowerCase();
  if (r === "sponsor" || r === "seller") return "Sponsor";
  if (r === "investor" || r === "buyer") return "Investor";
  return role?.trim() || "Signer";
}

function buildSignersFromSignFlow(
  doc: SignFlowDocument,
  send: StoredDealInvestorEsignSend | null,
): EsignDocumentTrailSigner[] {
  const sentAt = send?.sentAt?.trim() || doc.createdAt?.trim() || null;
  return (doc.recipients ?? []).map((r) => {
    const signed = r.signed === true;
    const name = clipText(r.name, 80) || "Signer";
    const email = clipText(r.email, 80);
    return {
      name,
      email,
      roleLabel: signFlowRoleLabel(r.role),
      securityLevel: "Email, Account Authentication (None)",
      sentAt,
      viewedAt: send?.viewedAt?.trim() || null,
      signedAt: signed
        ? doc.updatedAt?.trim() || send?.signedAt?.trim() || null
        : null,
      signatureLabel: signed
        ? `Signed by:\n${name}\n${clipText(doc.id, 40)}`
        : "—",
    };
  });
}

function buildSignersFromDropbox(
  detail: DropboxSignatureRequestDetail,
  send: StoredDealInvestorEsignSend | null,
): EsignDocumentTrailSigner[] {
  const sentAt = send?.sentAt?.trim() || detail.createdAt?.trim() || null;
  return detail.signers.map((s) => {
    const name = clipText(s.signerName, 80) || "Signer";
    const email = clipText(s.signerEmail, 80);
    const signed = Boolean(s.signedAt?.trim());
    return {
      name,
      email,
      roleLabel: "Signer",
      securityLevel: "Email, Account Authentication (None)",
      sentAt,
      viewedAt: s.lastViewedAt?.trim() || send?.viewedAt?.trim() || null,
      signedAt: s.signedAt?.trim() || null,
      signatureLabel: signed
        ? `Signed by:\n${name}\n${clipText(s.signatureId ?? detail.signatureRequestId, 40)}`
        : "—",
    };
  });
}

function pickOriginatorFromSignFlow(doc: SignFlowDocument): {
  name: string;
  email: string;
} {
  const sponsor = (doc.recipients ?? []).find((r) => {
    const role = String(r.role ?? "").trim().toLowerCase();
    return role === "sponsor" || role === "seller";
  });
  if (sponsor) {
    return {
      name: clipText(sponsor.name, 80) || "Deal sponsor",
      email: clipText(sponsor.email, 80) || "—",
    };
  }
  const first = doc.recipients?.[0];
  return {
    name: clipText(first?.name, 80) || "Deal sponsor",
    email: clipText(first?.email, 80) || "—",
  };
}

function isInvestorRoleLabel(roleLabel: string): boolean {
  return roleLabel.trim().toLowerCase() === "investor";
}

function filterSignersForAudience(
  signers: EsignDocumentTrailSigner[],
  audience: EsignDocumentTrailAudience,
): EsignDocumentTrailSigner[] {
  if (audience === "full") return signers;
  const investors = signers.filter((s) => isInvestorRoleLabel(s.roleLabel));
  return investors.length > 0 ? investors : signers.slice(0, 1);
}

function pickInvestorSigner(
  signers: EsignDocumentTrailSigner[],
): EsignDocumentTrailSigner | null {
  return (
    signers.find((s) => isInvestorRoleLabel(s.roleLabel)) ?? signers[0] ?? null
  );
}

function buildInvestorSummaryEvents(params: {
  sentAt: string | null;
  signedAt: string | null;
  completedAt: string | null;
}): EsignDocumentTrailSummaryEvent[] {
  const events: EsignDocumentTrailSummaryEvent[] = [];
  if (params.sentAt) {
    events.push({
      label: "Envelope Sent",
      status: "Hashed/Encrypted",
      timestamp: params.sentAt,
    });
  }
  const signedAt = params.signedAt?.trim() || null;
  const completedAt = params.completedAt?.trim() || null;
  if (signedAt) {
    events.push({
      label: "Signing Complete",
      status: "Security Checked",
      timestamp: signedAt,
    });
  }
  if (completedAt && completedAt !== signedAt) {
    events.push({
      label: "Completed",
      status: "Security Checked",
      timestamp: completedAt,
    });
  }
  return events;
}

function buildSummaryEvents(params: {
  sentAt: string | null;
  completedAt: string | null;
}): EsignDocumentTrailSummaryEvent[] {
  const events: EsignDocumentTrailSummaryEvent[] = [];
  if (params.sentAt) {
    events.push({
      label: "Envelope Sent",
      status: "Hashed/Encrypted",
      timestamp: params.sentAt,
    });
  }
  if (params.completedAt) {
    events.push({
      label: "Certified Delivered",
      status: "Security Checked",
      timestamp: params.completedAt,
    });
    events.push({
      label: "Signing Complete",
      status: "Security Checked",
      timestamp: params.completedAt,
    });
    events.push({
      label: "Completed",
      status: "Security Checked",
      timestamp: params.completedAt,
    });
  }
  return events;
}

export async function buildEsignDocumentTrailModel(params: {
  dealId: string;
  signatureRequestId: string;
  send?: StoredDealInvestorEsignSend | null;
  documentPages: number;
  audience?: EsignDocumentTrailAudience;
}): Promise<EsignDocumentTrailModel | null> {
  const audience = params.audience ?? "investor";
  const dealId = params.dealId.trim();
  const signatureRequestId = params.signatureRequestId.trim();
  if (!dealId || !signatureRequestId) return null;

  const deal = await getAddDealFormById(dealId);
  const send = params.send ?? null;
  const docName =
    send?.documents?.find((d) => d.name?.trim())?.name?.trim() ||
    deal?.dealName?.trim() ||
    "Signed document";
  const subject = clipText(docName, 100);
  const sentAt = send?.sentAt?.trim() || null;
  const completedAt =
    send?.completedAt?.trim() ||
    send?.signedAt?.trim() ||
    null;

  const provider = getActiveEsignProvider();
  if (provider === "signflow") {
    try {
      const doc = await getSignFlowDocument(signatureRequestId);
      const allSigners = buildSignersFromSignFlow(doc, send);
      const signers = filterSignersForAudience(allSigners, audience);
      const investorSigner = pickInvestorSigner(signers);
      const originator =
        audience === "investor" && investorSigner
          ? { name: investorSigner.name, email: investorSigner.email }
          : pickOriginatorFromSignFlow(doc);
      const signedCount = signers.filter((s) => s.signedAt).length;
      const investorSignedAt = investorSigner?.signedAt?.trim() || null;
      const status =
        audience === "investor"
          ? investorSignedAt
            ? "Signed"
            : "Sent"
          : String(doc.status ?? "").trim().toLowerCase() === "completed"
            ? "Completed"
            : signedCount > 0
              ? "Signed"
              : "Sent";
      const recordHolderName =
        audience === "investor" && investorSigner
          ? investorSigner.name
          : originator.name;
      const recordHolderEmail =
        audience === "investor" && investorSigner
          ? investorSigner.email
          : originator.email;
      return {
        envelopeId: signatureRequestId,
        subject,
        status,
        documentPages: Math.max(1, params.documentPages),
        signatureCount: signedCount,
        certificatePages: 1,
        initialsCount: 0,
        autoNav: "Enabled",
        envelopeIdStamping: "Enabled",
        timeZoneLabel: TIME_ZONE_LABEL,
        originatorName: originator.name,
        originatorEmail: originator.email,
        originatorAddress: "Address N/A",
        originatorIp: "N/A",
        recordStatus: "Original",
        recordHolderName,
        recordHolderEmail,
        recordLocation: PLATFORM_NAME,
        recordTimestamp: sentAt || doc.createdAt?.trim() || null,
        signers,
        summaryEvents:
          audience === "investor"
            ? buildInvestorSummaryEvents({
                sentAt: sentAt || doc.createdAt?.trim() || null,
                signedAt: investorSignedAt || send?.signedAt?.trim() || null,
                completedAt:
                  completedAt ||
                  (status === "Completed" ? doc.updatedAt ?? null : null),
              })
            : buildSummaryEvents({
                sentAt: sentAt || doc.createdAt?.trim() || null,
                completedAt:
                  completedAt ||
                  (status === "Completed" ? doc.updatedAt ?? null : null),
              }),
      };
    } catch (err) {
      console.warn("buildEsignDocumentTrailModel (SignFlow):", err);
    }
  } else {
    try {
      const detail = await getSignatureRequestDetail(signatureRequestId);
      const allSigners = buildSignersFromDropbox(detail, send);
      const signers = filterSignersForAudience(allSigners, audience);
      const investorSigner = pickInvestorSigner(signers);
      const originator =
        audience === "investor" && investorSigner
          ? { name: investorSigner.name, email: investorSigner.email }
          : (signers[0] ?? {
              name: "Deal sponsor",
              email: "—",
            });
      const signedCount = signers.filter((s) => s.signedAt).length;
      const investorSignedAt = investorSigner?.signedAt?.trim() || null;
      return {
        envelopeId: detail.signatureRequestId,
        subject,
        status:
          audience === "investor"
            ? investorSignedAt
              ? "Signed"
              : "Sent"
            : detail.isComplete
              ? "Completed"
              : signedCount > 0
                ? "Signed"
                : "Sent",
        documentPages: Math.max(1, params.documentPages),
        signatureCount: signedCount,
        certificatePages: 1,
        initialsCount: 0,
        autoNav: "Enabled",
        envelopeIdStamping: "Enabled",
        timeZoneLabel: TIME_ZONE_LABEL,
        originatorName: originator.name,
        originatorEmail: originator.email,
        originatorAddress: "Address N/A",
        originatorIp: "N/A",
        recordStatus: "Original",
        recordHolderName:
          audience === "investor" && investorSigner
            ? investorSigner.name
            : originator.name,
        recordHolderEmail:
          audience === "investor" && investorSigner
            ? investorSigner.email
            : originator.email,
        recordLocation: PLATFORM_NAME,
        recordTimestamp: sentAt || detail.createdAt?.trim() || null,
        signers,
        summaryEvents:
          audience === "investor"
            ? buildInvestorSummaryEvents({
                sentAt: sentAt || detail.createdAt?.trim() || null,
                signedAt: investorSignedAt || send?.signedAt?.trim() || null,
                completedAt:
                  completedAt || detail.completeAt?.trim() || null,
              })
            : buildSummaryEvents({
                sentAt: sentAt || detail.createdAt?.trim() || null,
                completedAt: completedAt || detail.completeAt?.trim() || null,
              }),
      };
    } catch (err) {
      console.warn("buildEsignDocumentTrailModel (Dropbox):", err);
    }
  }

  if (!send) return null;
  return {
    envelopeId: signatureRequestId,
    subject,
    status: send.completedAt?.trim() ? "Completed" : send.signedAt?.trim() ? "Signed" : "Sent",
    documentPages: Math.max(1, params.documentPages),
    signatureCount: send.signedAt?.trim() ? 1 : 0,
    certificatePages: 1,
    initialsCount: 0,
    autoNav: "Enabled",
    envelopeIdStamping: "Enabled",
    timeZoneLabel: TIME_ZONE_LABEL,
    originatorName: deal?.dealName?.trim() || "Deal sponsor",
    originatorEmail: "—",
    originatorAddress: "Address N/A",
    originatorIp: "N/A",
    recordStatus: "Original",
    recordHolderName: deal?.dealName?.trim() || "Deal sponsor",
    recordHolderEmail: "—",
    recordLocation: PLATFORM_NAME,
    recordTimestamp: sentAt,
    signers: [],
    summaryEvents: buildSummaryEvents({ sentAt, completedAt }),
  };
}

export async function appendEsignDocumentTrailCertificate(
  signedPdf: Buffer,
  params: {
    dealId: string;
    signatureRequestId: string;
    send?: StoredDealInvestorEsignSend | null;
    audience?: EsignDocumentTrailAudience;
  },
): Promise<Buffer> {
  const mainDoc = await PDFDocument.load(signedPdf, { ignoreEncryption: true });
  const documentPages = mainDoc.getPageCount();
  const model = await buildEsignDocumentTrailModel({
    dealId: params.dealId,
    signatureRequestId: params.signatureRequestId,
    send: params.send ?? null,
    documentPages,
    audience: params.audience ?? "investor",
  });
  if (!model) return signedPdf;

  const certificateBuffer = await buildEsignDocumentTrailPdfBuffer({
    ...model,
    certificatePages: 1,
  });
  const certDoc = await PDFDocument.load(certificateBuffer, {
    ignoreEncryption: true,
  });

  const merged = await PDFDocument.create();
  const mainPages = await merged.copyPages(mainDoc, mainDoc.getPageIndices());
  for (const page of mainPages) merged.addPage(page);
  const certPages = await merged.copyPages(certDoc, certDoc.getPageIndices());
  for (const page of certPages) merged.addPage(page);

  return Buffer.from(await merged.save());
}
