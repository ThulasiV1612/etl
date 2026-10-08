import { mkdir, writeFile } from "node:fs/promises";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import { formatDdMmmYyyy } from "../../utils/formatDdMmmYyyy.js";
import {
  dealAssetsAbsoluteDir,
  dealAssetsRelativePath,
  resolveDealStorageFolderName,
} from "./dealStoragePaths.service.js";

export const DEAL_FUNDING_INSTRUCTIONS_FOLDER = "funding-instructions";
/** @deprecated Legacy single-file name; new saves use timestamped filenames. */
export const FUNDING_INSTRUCTIONS_PDF_FILENAME = "funding-instructions.pdf";

export function fundingInstructionsPdfFilename(savedAt: Date): string {
  return `funding-instructions-${savedAt.getTime()}.pdf`;
}

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const MARGIN_X = 54;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 54;
const TITLE_SIZE = 14;
const SECTION_SIZE = 11;
const LABEL_SIZE = 9;
const VALUE_SIZE = 10;
const LINE_GAP = 4;
const SECTION_GAP = 18;
const BLOCK_GAP = 10;

type FundingInstructionsPayload = {
  ach: {
    enabled: boolean
    receivingBank: string
    bankAddress: string
    routingNumber: string
    accountNumber: string
    accountType: string
    beneficiaryAccountName: string
    beneficiaryAddress: string
    reference: string
    otherInstructions: string
  }
  wire: {
    enabled: boolean;
    receivingBank: string;
    bankAddress: string;
    routingNumber: string;
    accountNumber: string;
    accountType: string;
    beneficiaryAccountName: string;
    beneficiaryAddress: string;
    reference: string;
    otherInstructions: string;
  };
  checks: {
    enabled: boolean;
    mailingAddress: string;
    beneficiary: string;
    beneficiaryAddress: string;
    memo: string;
    otherInstructions: string;
  };
  investmentFee: {
    method: string;
    handlingMethod: string;
    amount: string;
  };
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

function clipText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseFundingInstructionsJson(raw: string): FundingInstructionsPayload {
  const defaults: FundingInstructionsPayload = {
    ach: {
      enabled: false,
      receivingBank: "",
      bankAddress: "",
      routingNumber: "",
      accountNumber: "",
      accountType: "checking",
      beneficiaryAccountName: "",
      beneficiaryAddress: "",
      reference: "",
      otherInstructions: "",
    },
    wire: {
      enabled: true,
      receivingBank: "",
      bankAddress: "",
      routingNumber: "",
      accountNumber: "",
      accountType: "checking",
      beneficiaryAccountName: "",
      beneficiaryAddress: "",
      reference: "",
      otherInstructions: "",
    },
    checks: {
      enabled: false,
      mailingAddress: "",
      beneficiary: "",
      beneficiaryAddress: "",
      memo: "",
      otherInstructions: "",
    },
    investmentFee: {
      method: "none",
      handlingMethod: "in_addition",
      amount: "",
    },
  };
  const t = raw.trim();
  if (!t) return defaults;
  try {
    const parsed = JSON.parse(t) as Record<string, unknown>;
    const ach =
      parsed.ach && typeof parsed.ach === "object" && !Array.isArray(parsed.ach)
        ? (parsed.ach as Record<string, unknown>)
        : {};
    const wire =
      parsed.wire && typeof parsed.wire === "object" && !Array.isArray(parsed.wire)
        ? (parsed.wire as Record<string, unknown>)
        : {};
    const checks =
      parsed.checks &&
      typeof parsed.checks === "object" &&
      !Array.isArray(parsed.checks)
        ? (parsed.checks as Record<string, unknown>)
        : {};
    const investmentFee =
      parsed.investmentFee &&
      typeof parsed.investmentFee === "object" &&
      !Array.isArray(parsed.investmentFee)
        ? (parsed.investmentFee as Record<string, unknown>)
        : {};
    return {
      ach: {
        enabled: ach.enabled === true,
        receivingBank: clipText(ach.receivingBank),
        bankAddress: clipText(ach.bankAddress),
        routingNumber: clipText(ach.routingNumber),
        accountNumber: clipText(ach.accountNumber),
        accountType: clipText(ach.accountType) || "checking",
        beneficiaryAccountName: clipText(ach.beneficiaryAccountName),
        beneficiaryAddress: clipText(ach.beneficiaryAddress),
        reference: clipText(ach.reference),
        otherInstructions: clipText(ach.otherInstructions),
      },
      wire: {
        enabled: wire.enabled !== false,
        receivingBank: clipText(wire.receivingBank),
        bankAddress: clipText(wire.bankAddress),
        routingNumber: clipText(wire.routingNumber),
        accountNumber: clipText(wire.accountNumber),
        accountType: clipText(wire.accountType) || "checking",
        beneficiaryAccountName: clipText(wire.beneficiaryAccountName),
        beneficiaryAddress: clipText(wire.beneficiaryAddress),
        reference: clipText(wire.reference),
        otherInstructions: clipText(wire.otherInstructions),
      },
      checks: {
        enabled: checks.enabled === true,
        mailingAddress: clipText(checks.mailingAddress),
        beneficiary: clipText(checks.beneficiary),
        beneficiaryAddress: clipText(checks.beneficiaryAddress),
        memo: clipText(checks.memo),
        otherInstructions: clipText(checks.otherInstructions),
      },
      investmentFee: {
        method: clipText(investmentFee.method) || "none",
        handlingMethod:
          clipText(investmentFee.handlingMethod) === "included"
            ? "included"
            : "in_addition",
        amount: clipText(investmentFee.amount),
      },
    };
  } catch {
    return defaults;
  }
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

function drawLine(
  writer: PdfWriter,
  text: string,
  font: PDFFont,
  size: number,
): void {
  ensureSpace(writer, size + LINE_GAP);
  writer.page.drawText(text, {
    x: MARGIN_X,
    y: pdfYFromTop(writer.cursorTop + size),
    size,
    font,
    color: rgb(0, 0, 0),
  });
  writer.cursorTop += size + LINE_GAP;
}

function drawWrappedBlock(
  writer: PdfWriter,
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): void {
  for (const line of wrapTextLines(text, font, size, maxWidth)) {
    drawLine(writer, line, font, size);
  }
}

function drawField(
  writer: PdfWriter,
  label: string,
  value: string,
  maxWidth: number,
): void {
  drawLine(writer, label, writer.fontBold, LABEL_SIZE);
  drawWrappedBlock(
    writer,
    value.trim() || "—",
    writer.fontRegular,
    VALUE_SIZE,
    maxWidth,
  );
  writer.cursorTop += BLOCK_GAP;
}

function drawSectionHeading(writer: PdfWriter, title: string): void {
  ensureSpace(writer, SECTION_SIZE + SECTION_GAP);
  drawLine(writer, title.toUpperCase(), writer.fontBold, SECTION_SIZE);
  writer.cursorTop += 4;
}

function feeMethodLabel(method: string): string {
  if (method === "flat") return "Flat fee";
  if (method === "percent") return "Percentage fee";
  return "None";
}

function feeHandlingLabel(method: string): string {
  return method === "included" ? "Included in commitment" : "In addition to commitment";
}

function wireHasDetails(wire: FundingInstructionsPayload["wire"]): boolean {
  return [
    wire.receivingBank,
    wire.bankAddress,
    wire.routingNumber,
    wire.accountNumber,
    wire.beneficiaryAccountName,
    wire.beneficiaryAddress,
    wire.reference,
    wire.otherInstructions,
  ].some((v) => v.trim().length > 0);
}

function achHasDetails(ach: FundingInstructionsPayload["ach"]): boolean {
  return [
    ach.receivingBank,
    ach.bankAddress,
    ach.routingNumber,
    ach.accountNumber,
    ach.beneficiaryAccountName,
    ach.beneficiaryAddress,
    ach.reference,
    ach.otherInstructions,
  ].some((v) => v.trim().length > 0);
}

export async function buildFundingInstructionsPdf(params: {
  fundingInstructionsJson: string;
  dealName?: string | null;
}): Promise<Buffer> {
  const payload = parseFundingInstructionsJson(params.fundingInstructionsJson);
  const pdf = await PDFDocument.create();
  const writer = await createWriter(pdf);
  const maxWidth = LETTER_WIDTH - MARGIN_X * 2;

  const title = "FUNDING INFORMATION";
  const titleWidth = writer.fontBold.widthOfTextAtSize(title, TITLE_SIZE);
  writer.page.drawText(title, {
    x: (LETTER_WIDTH - titleWidth) / 2,
    y: pdfYFromTop(MARGIN_TOP + TITLE_SIZE),
    size: TITLE_SIZE,
    font: writer.fontBold,
    color: rgb(0, 0, 0),
  });
  writer.cursorTop = MARGIN_TOP + TITLE_SIZE + 16;

  const metaParts: string[] = [];
  if (params.dealName?.trim()) metaParts.push(`Deal Name: ${params.dealName.trim()}`);
  metaParts.push(`Generated: ${formatDdMmmYyyy(new Date())}`);
  drawWrappedBlock(writer, metaParts.join("  ·  "), writer.fontRegular, VALUE_SIZE, maxWidth);
  writer.cursorTop += SECTION_GAP;

  if (payload.ach.enabled) {
    drawSectionHeading(writer, "ACH payments");
    if (achHasDetails(payload.ach)) {
      drawField(writer, "Receiving bank", payload.ach.receivingBank, maxWidth);
      drawField(writer, "Bank address", payload.ach.bankAddress, maxWidth);
      drawField(writer, "Routing number", payload.ach.routingNumber, maxWidth);
      drawField(writer, "Account number", payload.ach.accountNumber, maxWidth);
      drawField(
        writer,
        "Account type",
        payload.ach.accountType === "savings" ? "Savings" : "Checking",
        maxWidth,
      );
      drawField(
        writer,
        "Beneficiary account name",
        payload.ach.beneficiaryAccountName,
        maxWidth,
      );
      // Beneficiary address — hidden per product.
      // drawField(
      //   writer,
      //   "Beneficiary address",
      //   payload.ach.beneficiaryAddress,
      //   maxWidth,
      // );
      drawField(writer, "Reference", payload.ach.reference, maxWidth);
      drawField(
        writer,
        "Other instructions",
        payload.ach.otherInstructions,
        maxWidth,
      );
    } else {
      drawWrappedBlock(
        writer,
        "When no ACH instructions have been provided, LPs will be asked to contact their sponsor for ACH details.",
        writer.fontRegular,
        VALUE_SIZE,
        maxWidth,
      );
      writer.cursorTop += BLOCK_GAP;
    }
    writer.cursorTop += SECTION_GAP;
  }

  if (payload.wire.enabled) {
    drawSectionHeading(writer, "Wire transfers");
    if (wireHasDetails(payload.wire)) {
      drawField(writer, "Receiving bank", payload.wire.receivingBank, maxWidth);
      drawField(writer, "Bank address", payload.wire.bankAddress, maxWidth);
      drawField(writer, "Routing number", payload.wire.routingNumber, maxWidth);
      drawField(writer, "Account number", payload.wire.accountNumber, maxWidth);
      drawField(
        writer,
        "Account type",
        payload.wire.accountType === "savings" ? "Savings" : "Checking",
        maxWidth,
      );
      drawField(
        writer,
        "Beneficiary account name",
        payload.wire.beneficiaryAccountName,
        maxWidth,
      );
      // Beneficiary address — hidden per product.
      // drawField(
      //   writer,
      //   "Beneficiary address",
      //   payload.wire.beneficiaryAddress,
      //   maxWidth,
      // );
      drawField(writer, "Reference", payload.wire.reference, maxWidth);
      drawField(
        writer,
        "Other instructions",
        payload.wire.otherInstructions,
        maxWidth,
      );
    } else {
      drawWrappedBlock(
        writer,
        "Wire instructions have not been provided. Contact your sponsor for wire details.",
        writer.fontRegular,
        VALUE_SIZE,
        maxWidth,
      );
      writer.cursorTop += BLOCK_GAP;
    }
    writer.cursorTop += SECTION_GAP;
  }

  if (payload.checks.enabled) {
    drawSectionHeading(writer, "Checks");
    drawField(writer, "Beneficiary Name", payload.checks.beneficiary, maxWidth);
    drawField(writer, "Mailing address", payload.checks.mailingAddress, maxWidth);
    // Beneficiary address — hidden per product.
    // drawField(
    //   writer,
    //   "Beneficiary address",
    //   payload.checks.beneficiaryAddress,
    //   maxWidth,
    // );
    drawField(writer, "Memo", payload.checks.memo, maxWidth);
    drawField(
      writer,
      "Other instructions",
      payload.checks.otherInstructions,
      maxWidth,
    );
    writer.cursorTop += SECTION_GAP;
  }

  if (payload.investmentFee.method !== "none") {
    drawSectionHeading(writer, "Investment fee");
    drawField(
      writer,
      "Fee method",
      feeMethodLabel(payload.investmentFee.method),
      maxWidth,
    );
    drawField(
      writer,
      "Fee handling",
      feeHandlingLabel(payload.investmentFee.handlingMethod),
      maxWidth,
    );
    drawField(writer, "Fee amount", payload.investmentFee.amount, maxWidth);
  }

  return Buffer.from(await pdf.save());
}

export async function saveFundingInstructionsPdfFile(params: {
  dealId: string;
  pdfBuffer: Buffer;
  savedAt?: Date;
}): Promise<string> {
  const dealId = params.dealId.trim();
  const savedAt = params.savedAt ?? new Date();
  const filename = fundingInstructionsPdfFilename(savedAt);
  const dealFolder = await resolveDealStorageFolderName(dealId);
  const dir = dealAssetsAbsoluteDir(dealFolder, DEAL_FUNDING_INSTRUCTIONS_FOLDER);
  await mkdir(dir, { recursive: true });
  const abs = `${dir}/${filename}`.replace(/\\/g, "/");
  await writeFile(abs, params.pdfBuffer);
  return dealAssetsRelativePath(
    dealFolder,
    DEAL_FUNDING_INSTRUCTIONS_FOLDER,
    filename,
  );
}
