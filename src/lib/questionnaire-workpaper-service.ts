/**
 * Questionnaire → Workpaper Integration Service
 * 
 * CRITICAL: Questionnaires NEVER overwrite ledger/TB lines.
 * They only:
 * - Add new lines (adjustments, disclosures, extra income)
 * - Populate non-ledger-only sections (director info, elections, narrative notes)
 */

import { supabase } from "@/integrations/supabase/client";

// Categories that questionnaires CAN populate (non-ledger sections)
const QUESTIONNAIRE_ALLOWED_CATEGORIES = {
  self_assessment: [
    // Employment (often from questionnaire, not TB)
    "employment_income",
    "benefits_in_kind",
    "employment_expenses",
    // Investment income details
    "dividends",
    "bank_interest",
    // Deductions & reliefs
    "pension_contributions",
    "gift_aid",
    // Personal details
    "personal_allowance",
    // Disclosures & narrative
    "director_info",
    "elections",
    "narrative_notes",
    "additional_disclosures",
  ],
  ct600: [
    // Manual adjustments
    "capital_allowances",
    "disallowable_expenses",
    "qualifying_donations",
    "property_income",
    "chargeable_gains",
    // Director/company info
    "director_loans",
    "close_company_info",
    "group_relief",
    // Disclosures
    "research_development",
    "related_party_transactions",
  ],
  company_accounts: [
    // Notes to accounts
    "accounting_policies",
    "director_info",
    "average_employees",
    "contingent_liabilities",
    "post_balance_sheet_events",
    "related_party_transactions",
  ],
  vat_return: [
    // Manual adjustments
    "box2_vat_due_acquisitions",
    "box8_goods_to_eu",
    "box9_goods_from_eu",
    // Narrative
    "adjustments_narrative",
  ],
};

// Question types that map to specific workpaper fields
export interface QuestionnaireMapping {
  questionId: string;
  questionLabel: string;
  workpaperCategory: string;
  fieldType: "number" | "text" | "date" | "yes_no" | "file";
  isAdjustment?: boolean;
}

export interface QuestionnaireResponse {
  questionId: string;
  value: any;
  files?: Array<{
    fileName: string;
    filePath: string;
    fileSize?: number;
  }>;
}

/**
 * Check if a category can be populated by questionnaire
 */
export function canQuestionnairePopulate(
  workpaperType: string,
  category: string
): boolean {
  const allowedCategories = QUESTIONNAIRE_ALLOWED_CATEGORIES[workpaperType as keyof typeof QUESTIONNAIRE_ALLOWED_CATEGORIES] || [];
  return allowedCategories.includes(category);
}

/**
 * Merge questionnaire responses into workpaper WITHOUT overwriting TB lines
 * 
 * @param workpaperId - The workpaper to merge into
 * @param questionnaireInstanceId - The questionnaire instance
 * @param responses - The questionnaire responses
 * @param mappings - How questions map to workpaper fields
 */
export async function mergeQuestionnaireToWorkpaper(
  workpaperId: string,
  questionnaireInstanceId: string,
  responses: QuestionnaireResponse[],
  mappings: QuestionnaireMapping[]
): Promise<{ success: boolean; mergedFields: string[]; skippedFields: string[]; error?: string }> {
  const mergedFields: string[] = [];
  const skippedFields: string[] = [];

  try {
    // Fetch the workpaper
    const { data: workpaper, error: fetchError } = await supabase
      .from("workpaper_instances")
      .select("*")
      .eq("id", workpaperId)
      .single();

    if (fetchError || !workpaper) {
      return { success: false, mergedFields: [], skippedFields: [], error: "Workpaper not found" };
    }

    if (workpaper.locked || workpaper.status === "finalised") {
      return { success: false, mergedFields: [], skippedFields: [], error: "Workpaper is locked" };
    }

    const currentFieldValues = (workpaper.field_values as Record<string, any>) || {};
    const serviceType = workpaper.service_type;
    const newFieldValues = { ...currentFieldValues };

    // Process each questionnaire response
    for (const response of responses) {
      const mapping = mappings.find(m => m.questionId === response.questionId);
      if (!mapping) continue;

      const category = mapping.workpaperCategory;

      // Check if we're allowed to populate this category
      if (!canQuestionnairePopulate(serviceType, category)) {
        // Check if this is a TB-sourced field
        const existingField = currentFieldValues[category];
        if (existingField?.source === "trial_balance") {
          // Never overwrite TB lines - skip silently
          skippedFields.push(category);
          continue;
        }
      }

      // Determine field key
      const fieldKey = mapping.isAdjustment 
        ? `questionnaire_${category}_${response.questionId}`
        : category;

      // Create field value
      newFieldValues[fieldKey] = {
        label: mapping.questionLabel,
        amount: mapping.fieldType === "number" ? parseFloat(response.value) || 0 : 0,
        value: response.value,
        source: "questionnaire",
        sourceReference: `Q:${questionnaireInstanceId}/${response.questionId}`,
        isKeyField: !mapping.isAdjustment,
        questionnaireInstanceId,
        displayOrder: (currentFieldValues[fieldKey]?.displayOrder || 999) + 0.1,
      };

      mergedFields.push(fieldKey);
    }

    // Update workpaper with merged data
    const { error: updateError } = await supabase
      .from("workpaper_instances")
      .update({
        field_values: newFieldValues,
        questionnaire_instance_id: questionnaireInstanceId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workpaperId);

    if (updateError) {
      return { success: false, mergedFields: [], skippedFields: [], error: updateError.message };
    }

    return { success: true, mergedFields, skippedFields };
  } catch (error) {
    console.error("Error merging questionnaire to workpaper:", error);
    return {
      success: false,
      mergedFields: [],
      skippedFields: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Link uploaded documents from questionnaire to job and workpaper
 */
export async function linkQuestionnaireDocuments(params: {
  questionnaireInstanceId: string;
  jobId: string;
  workpaperInstanceId?: string;
  documents: Array<{
    fileName: string;
    filePath: string;
    fileSize?: number;
    mimeType?: string;
    documentType: string; // P60, bank_statement, invoice, etc.
    questionId: string;
    questionLabel: string;
  }>;
  organizationId: string;
}): Promise<{ success: boolean; linkedCount: number; error?: string }> {
  try {
    const { questionnaireInstanceId, jobId, workpaperInstanceId, documents, organizationId } = params;

    if (!documents || documents.length === 0) {
      return { success: true, linkedCount: 0 };
    }

    // Prepare job_documents records
    const jobDocuments = documents.map(doc => ({
      organization_id: organizationId,
      job_id: jobId,
      file_name: doc.fileName,
      file_path: doc.filePath,
      file_size: doc.fileSize,
      mime_type: doc.mimeType,
      tags: [
        { type: doc.documentType },
        { source: "questionnaire" },
        { questionnaire_instance_id: questionnaireInstanceId },
        { question_id: doc.questionId },
        { question_label: doc.questionLabel },
        ...(workpaperInstanceId ? [{ workpaper_instance_id: workpaperInstanceId }] : []),
      ],
      uploaded_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from("job_documents")
      .insert(jobDocuments)
      .select();

    if (error) {
      return { success: false, linkedCount: 0, error: error.message };
    }

    return { success: true, linkedCount: data.length };
  } catch (error) {
    console.error("Error linking questionnaire documents:", error);
    return {
      success: false,
      linkedCount: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get document types for tagging
 */
export const DOCUMENT_TYPES = {
  // Personal tax
  p60: { label: "P60", category: "employment" },
  p11d: { label: "P11D", category: "employment" },
  p45: { label: "P45", category: "employment" },
  payslip: { label: "Payslip", category: "employment" },
  
  // Banking
  bank_statement: { label: "Bank Statement", category: "banking" },
  bank_certificate: { label: "Bank Interest Certificate", category: "banking" },
  
  // Investment
  dividend_voucher: { label: "Dividend Voucher", category: "investment" },
  share_certificate: { label: "Share Certificate", category: "investment" },
  
  // Property
  rental_statement: { label: "Rental Statement", category: "property" },
  mortgage_statement: { label: "Mortgage Statement", category: "property" },
  
  // Business
  sales_invoice: { label: "Sales Invoice", category: "revenue" },
  purchase_invoice: { label: "Purchase Invoice", category: "expense" },
  receipt: { label: "Receipt", category: "expense" },
  
  // Pension
  pension_statement: { label: "Pension Statement", category: "pension" },
  pension_contribution: { label: "Pension Contribution", category: "pension" },
  
  // Other
  contract: { label: "Contract", category: "legal" },
  correspondence: { label: "Correspondence", category: "other" },
  other: { label: "Other Document", category: "other" },
};

/**
 * Process questionnaire submission and update workpaper
 */
export async function processQuestionnaireSubmission(
  questionnaireInstanceId: string
): Promise<{ success: boolean; workpaperUpdated: boolean; documentsLinked: number; error?: string }> {
  try {
    // Fetch questionnaire instance with responses
    const { data: instance, error: fetchError } = await supabase
      .from("questionnaire_instances")
      .select(`
        *,
        job:jobs(id, organization_id),
        template:templates(content)
      `)
      .eq("id", questionnaireInstanceId)
      .single();

    if (fetchError || !instance) {
      return { success: false, workpaperUpdated: false, documentsLinked: 0, error: "Questionnaire not found" };
    }

    // Find associated workpaper
    const { data: workpaper } = await supabase
      .from("workpaper_instances")
      .select("id, service_type")
      .eq("job_id", instance.job_id)
      .maybeSingle();

    let workpaperUpdated = false;
    let documentsLinked = 0;

    // Extract responses and mappings from template content
    // Responses are stored in a JSONB field that may not be in the type definition
    const instanceData = instance as any;
    const responses = (instanceData.responses || []) as QuestionnaireResponse[];
    const templateContent = instance.template?.content as any;
    const mappings: QuestionnaireMapping[] = templateContent?.workpaperMappings || [];

    // If workpaper exists, merge questionnaire data
    if (workpaper) {
      const mergeResult = await mergeQuestionnaireToWorkpaper(
        workpaper.id,
        questionnaireInstanceId,
        responses,
        mappings
      );
      workpaperUpdated = mergeResult.success && mergeResult.mergedFields.length > 0;
    }

    // Extract and link any uploaded documents
    const uploadedDocs: any[] = [];
    for (const response of responses) {
      if (response.files && response.files.length > 0) {
        const mapping = mappings.find(m => m.questionId === response.questionId);
        for (const file of response.files) {
          uploadedDocs.push({
            fileName: file.fileName,
            filePath: file.filePath,
            fileSize: file.fileSize,
            documentType: mapping?.workpaperCategory || "other",
            questionId: response.questionId,
            questionLabel: mapping?.questionLabel || "Document",
          });
        }
      }
    }

    if (uploadedDocs.length > 0) {
      const linkResult = await linkQuestionnaireDocuments({
        questionnaireInstanceId,
        jobId: instance.job_id,
        workpaperInstanceId: workpaper?.id,
        documents: uploadedDocs,
        organizationId: instance.organization_id,
      });
      documentsLinked = linkResult.linkedCount;
    }

    return { success: true, workpaperUpdated, documentsLinked };
  } catch (error) {
    console.error("Error processing questionnaire submission:", error);
    return {
      success: false,
      workpaperUpdated: false,
      documentsLinked: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Add manual adjustment line to workpaper (from questionnaire or manual entry)
 */
export async function addAdjustmentLine(
  workpaperId: string,
  adjustment: {
    category: string;
    label: string;
    amount: number;
    source: "questionnaire" | "manual_adjustment";
    sourceReference?: string;
    notes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: workpaper, error: fetchError } = await supabase
      .from("workpaper_instances")
      .select("field_values, locked, status")
      .eq("id", workpaperId)
      .single();

    if (fetchError || !workpaper) {
      return { success: false, error: "Workpaper not found" };
    }

    if (workpaper.locked || workpaper.status === "finalised") {
      return { success: false, error: "Workpaper is locked" };
    }

    const currentFieldValues = (workpaper.field_values as Record<string, any>) || {};
    
    // Generate unique key for adjustment
    const adjustmentKey = `adj_${adjustment.category}_${Date.now()}`;

    const newFieldValues = {
      ...currentFieldValues,
      [adjustmentKey]: {
        label: adjustment.label,
        amount: adjustment.amount,
        source: adjustment.source,
        sourceReference: adjustment.sourceReference,
        notes: adjustment.notes,
        isKeyField: false,
        isAdjustment: true,
        displayOrder: 999,
        createdAt: new Date().toISOString(),
      },
    };

    const { error: updateError } = await supabase
      .from("workpaper_instances")
      .update({ field_values: newFieldValues })
      .eq("id", workpaperId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Trigger records request for a job via RPC
 */
export async function triggerRecordsRequest(jobId: string): Promise<{
  success: boolean;
  questionnaireInstanceId?: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('trigger_records_request', {
      p_job_id: jobId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; questionnaire_instance_id?: string; error?: string };
    
    return {
      success: result.success,
      questionnaireInstanceId: result.questionnaire_instance_id,
      error: result.error,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Create a job from a template via RPC
 */
export async function createJobFromTemplate(params: {
  templateId: string;
  organizationId: string;
  clientId?: string;
  companyId?: string;
  engagementId?: string;
  serviceId?: string;
  periodStart?: string;
  periodEnd?: string;
  filingDeadline?: string;
  name?: string;
}): Promise<{
  success: boolean;
  jobId?: string;
  workpaperInstanceId?: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('create_job_from_template', {
      p_template_id: params.templateId,
      p_organization_id: params.organizationId,
      p_client_id: params.clientId || null,
      p_company_id: params.companyId || null,
      p_engagement_id: params.engagementId || null,
      p_service_id: params.serviceId || null,
      p_period_start: params.periodStart || null,
      p_period_end: params.periodEnd || null,
      p_filing_deadline: params.filingDeadline || null,
      p_name: params.name || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; job_id?: string; workpaper_instance_id?: string; error?: string };
    
    return {
      success: result.success,
      jobId: result.job_id,
      workpaperInstanceId: result.workpaper_instance_id,
      error: result.error,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
