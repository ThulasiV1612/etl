import { and, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import type { InvestorEsignRowTarget } from "./dealMemberEsignStatus.service.js";

const MAX_ANSWERS_JSON_CHARS = 512_000;

export type InvestorQuestionnaireAnswersMap = Record<string, string>;

export function parseInvestorQuestionnaireAnswersJson(
  raw: string | null | undefined,
): InvestorQuestionnaireAnswersMap | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const out: InvestorQuestionnaireAnswersMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      const id = String(key ?? "").trim();
      if (!id) continue;
      if (typeof value === "string") {
        out[id] = value;
        continue;
      }
      if (value != null) out[id] = String(value);
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function normalizeInvestorQuestionnaireAnswersInput(
  raw: unknown,
): InvestorQuestionnaireAnswersMap | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    return parseInvestorQuestionnaireAnswersJson(t);
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: InvestorQuestionnaireAnswersMap = {};
  for (const [key, value] of Object.entries(raw)) {
    const id = String(key ?? "").trim();
    if (!id) continue;
    if (typeof value === "string") {
      out[id] = value.trim();
      continue;
    }
    if (Array.isArray(value)) {
      out[id] = JSON.stringify(
        value.filter((v): v is string => typeof v === "string"),
      );
      continue;
    }
    if (value != null) out[id] = String(value).trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function serializeInvestorQuestionnaireAnswers(
  answers: InvestorQuestionnaireAnswersMap | null | undefined,
): string | null {
  if (!answers || !Object.keys(answers).length) return null;
  const json = JSON.stringify(answers);
  if (json.length > MAX_ANSWERS_JSON_CHARS) {
    throw new Error("Questionnaire answers are too large to save");
  }
  return json;
}

export async function readInvestorQuestionnaireAnswersForTarget(
  dealId: string,
  target: InvestorEsignRowTarget,
): Promise<InvestorQuestionnaireAnswersMap | null> {
  if (target.table !== "investment") return null;

  const [row] = await db
    .select({
      json: dealInvestment.investorQuestionnaireAnswersJson,
    })
    .from(dealInvestment)
    .where(
      and(
        eq(dealInvestment.id, target.id),
        eq(dealInvestment.dealId, dealId),
      ),
    )
    .limit(1);
  return parseInvestorQuestionnaireAnswersJson(row?.json);
}

export async function saveInvestorQuestionnaireAnswersForTarget(
  dealId: string,
  target: InvestorEsignRowTarget,
  answers: InvestorQuestionnaireAnswersMap | null,
): Promise<void> {
  const json = serializeInvestorQuestionnaireAnswers(answers);
  if (target.table !== "investment") return;

  await db
    .update(dealInvestment)
    .set({ investorQuestionnaireAnswersJson: json })
    .where(
      and(
        eq(dealInvestment.id, target.id),
        eq(dealInvestment.dealId, dealId),
      ),
    );
}
