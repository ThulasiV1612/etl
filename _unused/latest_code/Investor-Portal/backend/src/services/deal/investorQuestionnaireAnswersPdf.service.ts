import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { formatEinDisplay, nineDigitsFromEinInput } from "../../common/tax/usEin.js";
import {
  isSsnItinFieldKey,
  maskSsnItinLast4,
} from "../../common/tax/usSsnItin.js";
import { formatDdMmmYyyy } from "../../utils/formatDdMmmYyyy.js";
import type {
  InvestorQuestionnaireJson,
  InvestorQuestionnaireQuestion,
  InvestorQuestionnaireSection,
} from "./dealInvestorQuestionnaire.service.js";
import { isQuestionnaireSectionVisibleForProfile } from "./investorQuestionnaireProfileVisibility.js";
import type { InvestorQuestionnaireAnswersMap } from "./investorQuestionnaireAnswers.service.js";

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

function pdfYFromTop(topY: number): number {
  return LETTER_HEIGHT - topY;
}

function commitmentProfileToEsignCategory(profileId: string): string {
  const p = profileId.trim();
  if (p === "llc_corp_trust_etc") return "llc";
  if (
    p === "individual" ||
    p === "custodian_ira_401k" ||
    p === "joint_tenancy" ||
    p === "llc"
  ) {
    return p;
  }
  return "individual";
}

function visibleSectionsForProfile(
  config: InvestorQuestionnaireJson,
  esignCategoryId: string,
): InvestorQuestionnaireSection[] {
  const visibility = config.profileSectionVisibility;
  return [...config.sections]
    .filter((s) =>
      isQuestionnaireSectionVisibleForProfile(
        visibility,
        esignCategoryId,
        s.id,
      ),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function questionsForSection(
  config: InvestorQuestionnaireJson,
  sectionId: string,
): InvestorQuestionnaireQuestion[] {
  return config.questions
    .filter((q) => q.sectionId === sectionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function formatAnswerForPdf(
  question: InvestorQuestionnaireQuestion,
  raw: string | undefined,
): string {
  const value = String(raw ?? "").trim();
  if (!value) return "—";

  if (question.fieldType === "boolean") {
    if (value === "yes") return "Yes";
    if (value === "no") return "No";
    return value;
  }

  if (question.fieldType === "checkboxes") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        const items = parsed.filter((v): v is string => typeof v === "string");
        return items.length ? items.join(", ") : "—";
      }
    } catch {
      /* use raw */
    }
    return value;
  }

  if (question.fieldType === "phone") {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return value;
  }

  if (
    question.fieldType === "ein" ||
    question.id === "ira_entity_custodian_ein" ||
    question.id === "ira_entity_partner_ein"
  ) {
    const digits = nineDigitsFromEinInput(value);
    if (digits.length === 9) return formatEinDisplay(digits);
    return value;
  }

  if (
    question.fieldType === "ssn" ||
    isSsnItinFieldKey(question.id) ||
    isSsnItinFieldKey(question.label) ||
    isSsnItinFieldKey(question.investorProfileFieldKey ?? "")
  ) {
    return maskSsnItinLast4(value);
  }

  if (question.fieldType === "date") {
    const formatted = formatDdMmmYyyy(value);
    return formatted === "—" ? value : formatted;
  }

  return value.replace(/\s+/g, " ").trim();
}

function wrapTextLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  const breakWord = (word: string): string[] => {
    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) return [word];
    const parts: string[] = [];
    let chunk = "";
    for (const ch of word) {
      const candidate = `${chunk}${ch}`;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        chunk = candidate;
        continue;
      }
      if (chunk) parts.push(chunk);
      chunk = ch;
    }
    if (chunk) parts.push(chunk);
    return parts.length ? parts : [word];
  };
  for (const word of words) {
    const safeWordParts = breakWord(word);
    for (const part of safeWordParts) {
      const candidate = current ? `${current} ${part}` : part;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = part;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrappedLabel(
  writer: PdfWriter,
  text: string,
  maxWidth: number,
): void {
  for (const line of wrapTextLines(text, writer.fontBold, LABEL_SIZE, maxWidth)) {
    drawLine(writer, line, writer.fontBold, LABEL_SIZE, true);
  }
}

function drawWrappedValue(
  writer: PdfWriter,
  text: string,
  maxWidth: number,
): void {
  for (const line of wrapTextLines(text, writer.fontRegular, VALUE_SIZE, maxWidth)) {
    drawLine(writer, line, writer.fontRegular, VALUE_SIZE);
  }
}

function drawQuestionAnswer(
  writer: PdfWriter,
  label: string,
  answer: string,
): void {
  const maxWidth = LETTER_WIDTH - MARGIN_X * 2;
  drawWrappedLabel(writer, label, maxWidth);
  drawWrappedValue(writer, answer, maxWidth);
  writer.cursorTop += BLOCK_GAP;
}

type PdfWriter = {
  page: PDFPage;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  cursorTop: number;
  addPage: () => void;
};

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
  bold = false,
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

/**
 * Renders investor questionnaire responses for the profile sections enabled on
 * the deal's eSign template (Manage Questionnaire visibility).
 */
export async function buildInvestorQuestionnaireAnswersPdf(params: {
  config: InvestorQuestionnaireJson;
  answers: InvestorQuestionnaireAnswersMap;
  commitmentProfileId: string;
  dealName?: string;
  investorName?: string;
}): Promise<Buffer> {
  const esignCategoryId = commitmentProfileToEsignCategory(
    params.commitmentProfileId,
  );
  const sections = visibleSectionsForProfile(params.config, esignCategoryId);
  const pdf = await PDFDocument.create();
  const writer = await createWriter(pdf);

  const title = "INVESTOR QUESTIONNAIRE RESPONSES";
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
  if (params.dealName?.trim()) metaParts.push(`Deal: ${params.dealName.trim()}`);
  if (params.investorName?.trim()) {
    metaParts.push(`Investor: ${params.investorName.trim()}`);
  }
  metaParts.push(`Completed: ${formatDdMmmYyyy(new Date())}`);
  drawWrappedBlock(
    writer,
    metaParts.join("  ·  "),
    writer.fontRegular,
    VALUE_SIZE,
    LETTER_WIDTH - MARGIN_X * 2,
  );
  writer.cursorTop += SECTION_GAP;

  let wroteAny = false;
  for (const section of sections) {
    const questions = questionsForSection(params.config, section.id);
    const rows = questions
      .map((q) => ({
        question: q,
        answer: formatAnswerForPdf(q, params.answers[q.id]),
      }))
      .filter((row) => row.answer !== "—" || row.question.required);

    if (!rows.length) continue;
    wroteAny = true;

    ensureSpace(writer, SECTION_SIZE + SECTION_GAP);
    drawLine(writer, section.label.toUpperCase(), writer.fontBold, SECTION_SIZE, true);
    writer.cursorTop += 4;

    for (const { question, answer } of rows) {
      drawQuestionAnswer(writer, question.label, answer);
    }
    writer.cursorTop += SECTION_GAP;
  }

  if (!wroteAny) {
    drawQuestionAnswer(
      writer,
      "Responses",
      "No questionnaire responses were recorded for this investor profile.",
    );
  }

  return Buffer.from(await pdf.save());
}

export async function countPdfPages(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return doc.getPageCount();
}
