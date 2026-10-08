import { and, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { dealInvestment } from "../../schema/deal.schema/deal-investment.schema.js";
import { getSignFlowConfig } from "../../config/signflow.config.js";

import {
  resolveEsignSignflowSigningOrder,
  resolveEsignSignflowWorkflowType,
  resolveSignFlowRecipientOrders,
} from "../../constants/esignSigningWorkflow.js";

import type { CreateInvestorSignatureRequestResult } from "./dealMemberSendEsignDropbox.service.js";
import {
  assembleInvestorSigningPdf,
  buildEsignPrefillContext,
  persistInvestorEsignPreviewPdf,
} from "./dealMemberSendEsignDropbox.service.js";

import { remapSignFlowFieldsToSigningPdf, dedupeSignFlowFieldsByPlacement } from "./esignPdfPageMap.service.js";

import {
  ensureEsignTemplatePdfPrepared,
  getDealEsignTemplatesState,
  isEsignTemplateReady,
  isPdfEsignFile,
  readEsignTemplatePdfBuffer,
  resolveEsignTemplateExternalId,
  type EsignTemplateFileRecord,
} from "./dealEsignTemplates.service.js";
import { resolveDealLeadSponsorSigner } from "./dealEsignSigningWorkflow.service.js";
import { isEsignProviderUnreachableError } from "../esign/esignProviderErrors.js";

import type { InvestorEsignRowTarget } from "./dealMemberEsignStatus.service.js";

import type { InvestorQuestionnaireAnswersMap } from "./investorQuestionnaireAnswers.service.js";
import { getDealInvestorQuestionnaireState } from "./dealInvestorQuestionnaire.service.js";
import {
  applyQuestionnairePrefillToSignFlowFields,
  maskSsnInQuestionnaireAnswers,
  maskSsnValuesOnSignFlowFields,
} from "./investorQuestionnaireEsignPrefill.service.js";
import { resolveQuestionnaireAnswersForEsign } from "./investorProfileQuestionnairePrefill.service.js";
import { fetchPrefilledOnboardingFields } from "../onboarding/onboardingFieldsPython.service.js";
import { isOnboardingFieldsServiceConfigured } from "../../config/onboardingFields.config.js";
import { applySignflowInvestorDataFieldBindings } from "./dealEsignSignflow.service.js";
import {
  alignSignFlowTextFieldHeightsToDocument,
  getInvestorQuestionnaireSignatureSignFlowFields,
  isQuestionnaireSignatureFieldLabel,
} from "./esignPdfMerge.service.js";

import type { InvestorW9FormData } from "./investorW9Form.service.js";

import { portalProfileIdToSignFlowProfileType, signFlowFieldAppliesToProfile } from "../../constants/esignProfileTypes.js";

import {

  getSignFlowDocument,

  mapSignFlowTemplateFieldsForInvestor,

  mapSignFlowTemplateFieldsForSponsor,

  normalizeSignFlowFieldsForApi,

  resolveSignFlowTemplateDocumentFields,

  sendSignFlowDocumentForSigning,

  signFlowTemplateHasSponsorFields,

  type SignFlowField,

  type SignFlowRecipient,

} from "../esign/signflow.service.js";



async function resolveCommitmentProfileIdForSend(params: {
  dealId: string;
  esignTarget?: InvestorEsignRowTarget | null;
  commitmentProfileId?: string;
}): Promise<string | null> {
  const fromParams = params.commitmentProfileId?.trim();
  if (fromParams) return fromParams;
  if (!params.esignTarget || params.esignTarget.table !== "investment") {
    return null;
  }
  const [row] = await db
    .select({ profileId: dealInvestment.profileId })
    .from(dealInvestment)
    .where(
      and(
        eq(dealInvestment.id, params.esignTarget.id),
        eq(dealInvestment.dealId, params.dealId),
      ),
    )
    .limit(1);
  const profileId = String(row?.profileId ?? "").trim();
  return profileId || null;
}

export async function createInvestorSignatureRequestSignflow(params: {

  dealId: string;

  rosterId: string;

  toEmail: string;

  memberDisplayName?: string;

  dealName: string;

  selectedFiles: EsignTemplateFileRecord[];

  esignTarget?: InvestorEsignRowTarget | null;

  commitmentProfileId?: string;

  questionnaireAnswers?: InvestorQuestionnaireAnswersMap | null;

  w9FormData?: InvestorW9FormData | null;

  investmentId?: string;

  investorId?: string;

}): Promise<CreateInvestorSignatureRequestResult | null> {

  if (!getSignFlowConfig()) return null;

  if (params.selectedFiles.length !== 1) {

    throw new Error("SignFlow currently supports one template document per send");

  }



  const file = params.selectedFiles[0];

  if (!isPdfEsignFile(file)) {

    throw new Error("Only PDF templates can be sent for signing");

  }

  if (!isEsignTemplateReady(file, "signflow")) {
    throw new Error(
      "The eSign template is not ready yet. Ask your sponsor to finish saving the template in the eSign editor.",
    );
  }



  const templateDocumentId = resolveEsignTemplateExternalId(file, "signflow");

  if (!templateDocumentId) {

    throw new Error("Selected document is missing a SignFlow template id");

  }



  const signerEmail = params.toEmail.trim().toLowerCase();

  const signerName = params.memberDisplayName?.trim() || signerEmail;

  const dealLabel = params.dealName.trim() || "Deal";



  const assembled = await assembleInvestorSigningPdf({

    dealId: params.dealId,

    selectedFiles: params.selectedFiles,

    esignTarget: params.esignTarget,

    commitmentProfileId: params.commitmentProfileId,

    questionnaireAnswers: params.questionnaireAnswers,

    w9FormData: params.w9FormData,

    dealName: params.dealName,

    memberDisplayName: params.memberDisplayName,

    investorId: params.investorId,

  });



  let pdfBuffer: Buffer;

  if (assembled) {

    pdfBuffer = assembled.buffer;

  } else {

    const state = await getDealEsignTemplatesState(params.dealId);

    await ensureEsignTemplatePdfPrepared(
      params.dealId,
      file,
      state,
    );

    pdfBuffer = await readEsignTemplatePdfBuffer(file.relativePath);

  }



  let investorPreviewRelativePath: string | undefined;

  if (assembled?.savePreview) {

    try {

      investorPreviewRelativePath = await persistInvestorEsignPreviewPdf({

        dealId: params.dealId,

        rosterId: params.rosterId,

        buffer: pdfBuffer,

        fileName: assembled.fileName,

      });

    } catch (err) {

      console.warn("persistInvestorEsignPreviewPdf (SignFlow):", err);

    }

  }



  let templateDoc: Awaited<ReturnType<typeof getSignFlowDocument>>;
  try {
    templateDoc = await getSignFlowDocument(templateDocumentId);
  } catch (err) {
    if (isEsignProviderUnreachableError(err)) {
      throw new Error(
        "SignFlow is not reachable. Ask your sponsor to start the SignFlow service and try again.",
      );
    }
    throw err;
  }

  templateDoc = resolveSignFlowTemplateDocumentFields(file, templateDoc);

  const investorRecipientId = "rec_investor";

  const sponsorRecipientId = "rec_sponsor";

  const resolvedProfileId = await resolveCommitmentProfileIdForSend(params);

  const investorProfileType = portalProfileIdToSignFlowProfileType(

    resolvedProfileId,

  );

  let templateInvestorFields = mapSignFlowTemplateFieldsForInvestor(

    templateDoc,

    investorRecipientId,

  );

  templateInvestorFields = applySignflowInvestorDataFieldBindings(
    templateInvestorFields,
    file.signflowInvestorDataFieldBindings,
  );

  if (investorProfileType) {
    templateInvestorFields = templateInvestorFields.filter((field) =>
      signFlowFieldAppliesToProfile(field, investorProfileType),
    );
  }

  const hasInvestorTemplateFields = templateInvestorFields.length > 0;

  const includeQuestionnaire = Boolean(file.includeQuestionnaire);

  if (!hasInvestorTemplateFields) {

    templateInvestorFields = [

      {

        type: "signature",

        label: "Investor Signature",

        x: 10,

        y: 80,

        width: 30,

        height: 6,

        page: 1,

        templatePage: 1,

        recipientId: investorRecipientId,

        required: true,

      },

    ];

  } else if (includeQuestionnaire) {

    templateInvestorFields = templateInvestorFields.filter(

      (field) =>

        (field.templatePage ?? field.page) !== 1 ||

        !isQuestionnaireSignatureFieldLabel(field.label),

    );

  }

  const answerPageCount = assembled?.answerPageCount ?? 0;
  const questionnaireSigningPage = Math.max(1, answerPageCount + 1);

  let questionnaireFields: SignFlowField[] = [];
  if (includeQuestionnaire) {
    questionnaireFields = getInvestorQuestionnaireSignatureSignFlowFields(
      investorRecipientId,
      0,
    ).map((field) => ({
      ...field,
      page: questionnaireSigningPage,
      templatePage: 1,
    }));
  }

  const templateState = await getDealEsignTemplatesState(params.dealId);
  await ensureEsignTemplatePdfPrepared(params.dealId, file, templateState);
  const templateReferencePdf =
    assembled?.templateSigningBuffer ??
    Buffer.from(await readEsignTemplatePdfBuffer(file.relativePath));

  let templateFields = await remapSignFlowFieldsToSigningPdf(
    templateInvestorFields,
    templateReferencePdf,
    pdfBuffer,
  );

  if (includeQuestionnaire) {
    templateFields = templateFields.filter(
      (field) => Math.floor(field.page) !== questionnaireSigningPage,
    );
  }

  let investorFields = [...questionnaireFields, ...templateFields];

  const questionnaireAnswers = await resolveQuestionnaireAnswersForEsign({
    dealId: params.dealId,
    esignTarget: params.esignTarget,
    investorId: params.investorId,
    answers: params.questionnaireAnswers,
    w9Form: params.w9FormData,
  });

  const config = await getDealInvestorQuestionnaireState(params.dealId);
  const prefillContext = await buildEsignPrefillContext({
    dealId: params.dealId,
    esignTarget: params.esignTarget,
    memberDisplayName: params.memberDisplayName,
    memberEmail: signerEmail,
    w9Form: params.w9FormData,
    viewerUserId: params.investorId,
  });
  investorFields = applyQuestionnairePrefillToSignFlowFields({
    fields: investorFields,
    config,
    answers: questionnaireAnswers ?? {},
    memberDisplayName: params.memberDisplayName,
    prefillContext,
    // Document values stay masked (last 4 only) so sponsors never see full SSN.
    // Investors can still reveal full SSN while editing Invest Now / W-9 forms.
    maskSsn: true,
  });

  if (isOnboardingFieldsServiceConfigured()) {
    investorFields = await fetchPrefilledOnboardingFields({
      fields: investorFields,
      answers: maskSsnInQuestionnaireAnswers(
        questionnaireAnswers ?? {},
        config,
      ),
      context: {
        member_display_name: prefillContext.memberDisplayName,
        member_email: prefillContext.memberEmail,
        investment_amount: prefillContext.investmentAmount,
        address_line: prefillContext.addressLine,
        mailing_address_line: prefillContext.mailingAddressLine,
        street_line: prefillContext.streetLine,
        city: prefillContext.city,
        state: prefillContext.state,
        zip: prefillContext.zip,
        city_state_zip: prefillContext.cityStateZip,
      },
    });
  }

  // Always remask after any prefill path (Python may overwrite with raw answers).
  investorFields = maskSsnValuesOnSignFlowFields(investorFields);
  investorFields = alignSignFlowTextFieldHeightsToDocument(investorFields);
  investorFields = dedupeSignFlowFieldsByPlacement(investorFields);

  const includeSponsor = signFlowTemplateHasSponsorFields(templateDoc);
  let sponsorFields = includeSponsor
    ? mapSignFlowTemplateFieldsForSponsor(templateDoc, sponsorRecipientId)
    : [];

  let includeSponsorOnSend = includeSponsor && sponsorFields.length > 0;

  if (sponsorFields.length > 0) {
    sponsorFields = await remapSignFlowFieldsToSigningPdf(
      sponsorFields,
      templateReferencePdf,
      pdfBuffer,
    );
    // Sponsors must never see full SSN on their signing fields.
    sponsorFields = maskSsnValuesOnSignFlowFields(sponsorFields);
  }

  const workflowType = resolveEsignSignflowWorkflowType(file);
  const signingOrder = resolveEsignSignflowSigningOrder(file);

  const { investorOrder, sponsorOrder } = resolveSignFlowRecipientOrders(
    workflowType,
    signingOrder,
  );

  const recipients: SignFlowRecipient[] = [

    {

      id: investorRecipientId,

      name: signerName,

      email: signerEmail,

      role: "buyer",

      color: "#2563eb",

      order: investorOrder,

      ...(investorProfileType ? { profileType: investorProfileType } : {}),

    },

  ];



  if (includeSponsorOnSend) {
    const sponsorSigner = await resolveDealLeadSponsorSigner(params.dealId);
    if (!sponsorSigner) {
      console.warn(
        "SignFlow send: sponsor signature fields exist but no lead sponsor email; sending investor-only.",
      );
      includeSponsorOnSend = false;
      sponsorFields = [];
    } else {
      recipients.push({
        id: sponsorRecipientId,
        name: sponsorSigner.name,
        email: sponsorSigner.email,
        role: "seller",
        color: "#dc2626",
        order: sponsorOrder,
      });
    }
  }

  const fields = dedupeSignFlowFieldsByPlacement([
    ...normalizeSignFlowFieldsForApi(investorFields),
    ...normalizeSignFlowFieldsForApi(sponsorFields),
  ]);

  if (!fields.some((field) => field.recipientId === investorRecipientId)) {
    throw new Error(
      "No investor signing fields could be placed on this document. Ask your sponsor to re-save the eSign template.",
    );
  }

  const { documentId } = await sendSignFlowDocumentForSigning({

    title: `eSign — ${dealLabel}`,

    pdfBuffer,

    fileName: assembled?.fileName ?? file.originalName,

    recipients,

    fields,

    emailSubject: `Please sign — ${dealLabel}`,

    emailMessage: `<p>Please review and sign the documents for ${dealLabel}.</p>`,

    workflowType,

  });



  return {

    signatureRequestId: documentId,

    signatureId: investorRecipientId,

    signUrl: "",

    investorPreviewRelativePath,

  };

}

