import { z } from "zod";

// =====================================================
// DSL Field Whitelist - Only these fields can be used in conditions
// =====================================================

export const TRIGGER_FIELD_WHITELIST = [
  // Company fields
  "company.vat_stagger",
  "company.vat_frequency",
  "company.year_end_month",
  "company.year_end_day",
  "company.company_type",
  "company.vat_registered",
  "company.vat_scheme",
  // Client fields
  "client.status",
  "client.has_utr",
  // Engagement/Service fields
  "engagement.service_code",
  "engagement.status",
  "engagement.billing_frequency",
  // Payroll fields
  "payroll.frequency",
  "payroll.pay_day",
  "payroll.employee_count",
  // Period fields
  "period.month",
  "period.quarter",
  "period.is_year_end",
] as const;

export type TriggerField = typeof TRIGGER_FIELD_WHITELIST[number];

export const TRIGGER_OPERATORS = [
  "equals",
  "not_equals",
  "in",
  "not_in",
  "gt",
  "lt",
  "gte",
  "lte",
  "is_true",
  "is_false",
] as const;

export type TriggerOperator = typeof TRIGGER_OPERATORS[number];

// =====================================================
// Trigger Condition Schema (DSL)
// =====================================================

export const TriggerConditionSchema = z.object({
  field: z.enum(TRIGGER_FIELD_WHITELIST as unknown as [string, ...string[]]),
  operator: z.enum(TRIGGER_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
});

export type TriggerCondition = z.infer<typeof TriggerConditionSchema>;

// =====================================================
// Entity Filter Schema (DSL)
// =====================================================

export const EntityFilterSchema = z.object({
  entityType: z.enum(["company", "client", "both"]).optional(),
  companyTypes: z.array(z.string()).optional(), // ["limited", "llp", "plc"]
  hasServices: z.array(z.string()).optional(), // ["VAT", "PAYROLL", "CT"]
  vatRegistered: z.boolean().optional(),
  excludeInactive: z.boolean().default(true),
});

export type EntityFilter = z.infer<typeof EntityFilterSchema>;

// =====================================================
// Task Template Schema
// =====================================================

export const TaskDependencySchema = z.object({
  taskId: z.string().uuid(),
  type: z.enum(["blocking", "suggested"]).default("blocking"),
});

export const TaskConditionalSchema = z.object({
  field: z.enum(TRIGGER_FIELD_WHITELIST as unknown as [string, ...string[]]),
  operator: z.enum(TRIGGER_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
});

export const TaskTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  assigneeRole: z.enum(["junior", "senior", "manager", "partner", "unassigned"]).default("unassigned"),
  relativeDueDays: z.number().optional(), // Days relative to reference
  relativeDueReference: z.enum([
    "job_start",
    "job_end",
    "filing_deadline",
    "period_start",
    "period_end",
  ]).default("job_end"),
  dependencies: z.array(TaskDependencySchema).default([]),
  isClientFacing: z.boolean().default(false),
  taskType: z.enum([
    "manual",
    "document_upload",
    "questionnaire",
    "filing_draft",
    "review",
    "approval",
  ]).default("manual"),
  sectionId: z.string().uuid().optional(),
  order: z.number().default(0),
  showIf: TaskConditionalSchema.optional(),
  isFromBlock: z.boolean().default(false),
  blockId: z.string().uuid().optional(),
});

export type TaskTemplate = z.infer<typeof TaskTemplateSchema>;

// =====================================================
// Task Section Schema
// =====================================================

export const TaskSectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  order: z.number().default(0),
  collapsible: z.boolean().default(true),
  isFromBlock: z.boolean().default(false),
  blockId: z.string().uuid().optional(),
});

export type TaskSection = z.infer<typeof TaskSectionSchema>;

// =====================================================
// Records Request Item Schema
// =====================================================

export const RecordsRequestItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  requestType: z.enum(["document", "questionnaire", "data_field"]),
  fileTypes: z.array(z.string()).optional(), // ["pdf", "jpg", "png", "xlsx"]
  maxFiles: z.number().default(10),
  isRequired: z.boolean().default(true),
  groupId: z.string().uuid().optional(),
  targetFolder: z.string().optional(), // "workpapers/{{period}}/bank-statements"
  showIf: TaskConditionalSchema.optional(),
  reminderDaysBefore: z.number().optional(), // Auto-remind X days before deadline
  order: z.number().default(0),
});

export type RecordsRequestItem = z.infer<typeof RecordsRequestItemSchema>;

// =====================================================
// Records Request Group Schema
// =====================================================

export const RecordsRequestGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  order: z.number().default(0),
});

export type RecordsRequestGroup = z.infer<typeof RecordsRequestGroupSchema>;

// =====================================================
// Full Template Content Schema
// =====================================================

export const JobTemplateContentSchema = z.object({
  sections: z.array(TaskSectionSchema).default([]),
  tasks: z.array(TaskTemplateSchema).default([]),
  recordsRequestGroups: z.array(RecordsRequestGroupSchema).default([]),
  recordsRequests: z.array(RecordsRequestItemSchema).default([]),
  reusableBlockIds: z.array(z.string().uuid()).default([]),
  statusFlow: z.array(z.string()).optional(),
});

export type JobTemplateContent = z.infer<typeof JobTemplateContentSchema>;

// =====================================================
// Template Metadata Schema
// =====================================================

export const JobTemplateMetadataSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  serviceCode: z.string().optional(),
  frequency: z.enum(["one_off", "monthly", "quarterly", "annual", "triggered"]),
  triggerType: z.enum([
    "service_activated",
    "period_start",
    "period_end",
    "previous_job_completed",
    "manual",
  ]),
  relativeStartOffset: z.number().default(0),
  relativeDueOffset: z.number().default(30),
  defaultAssigneeRole: z.string().optional(),
  uiCategory: z.string().default("General"),
  triggerConditions: z.array(TriggerConditionSchema).default([]),
  entityFilters: EntityFilterSchema.optional(),
  skipIfNoActivity: z.boolean().default(false),
  autoCloseIfNoWork: z.boolean().default(false),
  questionnaireTemplateId: z.string().uuid().optional(),
  workpaperTemplateId: z.string().uuid().optional(),
  filingTemplateId: z.string().uuid().optional(),
});

export type JobTemplateMetadata = z.infer<typeof JobTemplateMetadataSchema>;

// =====================================================
// Template Presets
// =====================================================

export type TemplatePreset = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  metadata: Partial<JobTemplateMetadata>;
  content: Partial<JobTemplateContent>;
};

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "vat-return",
    name: "VAT Return",
    description: "Quarterly VAT return preparation and filing",
    category: "Tax",
    icon: "Receipt",
    metadata: {
      frequency: "quarterly",
      triggerType: "period_end",
      relativeDueOffset: 37, // 1 month + 7 days
      uiCategory: "VAT",
      serviceCode: "VAT",
    },
    content: {
      sections: [
        { id: crypto.randomUUID(), name: "Preparation", order: 0, collapsible: true, isFromBlock: false },
        { id: crypto.randomUUID(), name: "Review", order: 1, collapsible: true, isFromBlock: false },
        { id: crypto.randomUUID(), name: "Filing", order: 2, collapsible: true, isFromBlock: false },
      ],
      tasks: [
        {
          id: crypto.randomUUID(),
          name: "Request bank statements",
          taskType: "document_upload",
          isClientFacing: true,
          order: 0,
          assigneeRole: "junior",
          relativeDueReference: "period_end",
          relativeDueDays: 7,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Reconcile transactions",
          taskType: "manual",
          isClientFacing: false,
          order: 1,
          assigneeRole: "junior",
          relativeDueReference: "job_end",
          relativeDueDays: -14,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Prepare VAT return",
          taskType: "manual",
          isClientFacing: false,
          order: 2,
          assigneeRole: "senior",
          relativeDueReference: "job_end",
          relativeDueDays: -7,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Manager review",
          taskType: "review",
          isClientFacing: false,
          order: 3,
          assigneeRole: "manager",
          relativeDueReference: "job_end",
          relativeDueDays: -3,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Submit VAT return",
          taskType: "filing_draft",
          isClientFacing: false,
          order: 4,
          assigneeRole: "senior",
          relativeDueReference: "job_end",
          relativeDueDays: 0,
          dependencies: [],
          isFromBlock: false,
        },
      ],
      recordsRequests: [
        {
          id: crypto.randomUUID(),
          name: "Bank statements",
          description: "All bank statements for the VAT period",
          requestType: "document",
          fileTypes: ["pdf", "csv"],
          isRequired: true,
          order: 0,
          maxFiles: 10,
        },
        {
          id: crypto.randomUUID(),
          name: "Sales invoices",
          description: "All sales invoices issued during the period",
          requestType: "document",
          fileTypes: ["pdf"],
          isRequired: true,
          order: 1,
          maxFiles: 50,
        },
        {
          id: crypto.randomUUID(),
          name: "Purchase invoices",
          description: "All purchase invoices received during the period",
          requestType: "document",
          fileTypes: ["pdf"],
          isRequired: true,
          order: 2,
          maxFiles: 50,
        },
      ],
    },
  },
  {
    id: "year-end-accounts",
    name: "Year-End Accounts",
    description: "Annual accounts preparation and Companies House filing",
    category: "Accounts",
    icon: "FileText",
    metadata: {
      frequency: "annual",
      triggerType: "period_end",
      relativeDueOffset: 270, // 9 months
      uiCategory: "Accounts",
      serviceCode: "ACCOUNTS",
    },
    content: {
      sections: [
        { id: crypto.randomUUID(), name: "Information Gathering", order: 0, collapsible: true, isFromBlock: false },
        { id: crypto.randomUUID(), name: "Bookkeeping", order: 1, collapsible: true, isFromBlock: false },
        { id: crypto.randomUUID(), name: "Accounts Preparation", order: 2, collapsible: true, isFromBlock: false },
        { id: crypto.randomUUID(), name: "Review & Filing", order: 3, collapsible: true, isFromBlock: false },
      ],
      tasks: [
        {
          id: crypto.randomUUID(),
          name: "Send year-end questionnaire",
          taskType: "questionnaire",
          isClientFacing: true,
          order: 0,
          assigneeRole: "junior",
          relativeDueReference: "period_end",
          relativeDueDays: 14,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Request year-end documents",
          taskType: "document_upload",
          isClientFacing: true,
          order: 1,
          assigneeRole: "junior",
          relativeDueReference: "period_end",
          relativeDueDays: 30,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Complete bookkeeping",
          taskType: "manual",
          isClientFacing: false,
          order: 2,
          assigneeRole: "junior",
          relativeDueReference: "job_end",
          relativeDueDays: -90,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Prepare trial balance",
          taskType: "manual",
          isClientFacing: false,
          order: 3,
          assigneeRole: "senior",
          relativeDueReference: "job_end",
          relativeDueDays: -60,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Draft accounts",
          taskType: "manual",
          isClientFacing: false,
          order: 4,
          assigneeRole: "senior",
          relativeDueReference: "job_end",
          relativeDueDays: -45,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Manager review",
          taskType: "review",
          isClientFacing: false,
          order: 5,
          assigneeRole: "manager",
          relativeDueReference: "job_end",
          relativeDueDays: -30,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Client approval",
          taskType: "approval",
          isClientFacing: true,
          order: 6,
          assigneeRole: "senior",
          relativeDueReference: "job_end",
          relativeDueDays: -14,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "File accounts at Companies House",
          taskType: "filing_draft",
          isClientFacing: false,
          order: 7,
          assigneeRole: "senior",
          relativeDueReference: "job_end",
          relativeDueDays: 0,
          dependencies: [],
          isFromBlock: false,
        },
      ],
    },
  },
  {
    id: "monthly-bookkeeping",
    name: "Monthly Bookkeeping",
    description: "Regular monthly bookkeeping and reconciliation",
    category: "Bookkeeping",
    icon: "Calculator",
    metadata: {
      frequency: "monthly",
      triggerType: "period_end",
      relativeDueOffset: 15, // 15 days after month end
      uiCategory: "Bookkeeping",
      serviceCode: "BOOKKEEPING",
    },
    content: {
      tasks: [
        {
          id: crypto.randomUUID(),
          name: "Request bank statements",
          taskType: "document_upload",
          isClientFacing: true,
          order: 0,
          assigneeRole: "junior",
          relativeDueReference: "period_end",
          relativeDueDays: 5,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Import bank transactions",
          taskType: "manual",
          isClientFacing: false,
          order: 1,
          assigneeRole: "junior",
          relativeDueReference: "job_end",
          relativeDueDays: -5,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Categorise transactions",
          taskType: "manual",
          isClientFacing: false,
          order: 2,
          assigneeRole: "junior",
          relativeDueReference: "job_end",
          relativeDueDays: -3,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Reconcile accounts",
          taskType: "manual",
          isClientFacing: false,
          order: 3,
          assigneeRole: "junior",
          relativeDueReference: "job_end",
          relativeDueDays: -1,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Review and close period",
          taskType: "review",
          isClientFacing: false,
          order: 4,
          assigneeRole: "senior",
          relativeDueReference: "job_end",
          relativeDueDays: 0,
          dependencies: [],
          isFromBlock: false,
        },
      ],
    },
  },
  {
    id: "payroll-run",
    name: "Payroll Run",
    description: "Monthly payroll processing and RTI submission",
    category: "Payroll",
    icon: "Users",
    metadata: {
      frequency: "monthly",
      triggerType: "period_start",
      relativeDueOffset: 19, // RTI due by 19th
      uiCategory: "Payroll",
      serviceCode: "PAYROLL",
    },
    content: {
      tasks: [
        {
          id: crypto.randomUUID(),
          name: "Collect timesheet/absence data",
          taskType: "document_upload",
          isClientFacing: true,
          order: 0,
          assigneeRole: "junior",
          relativeDueReference: "period_start",
          relativeDueDays: 5,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Process payroll",
          taskType: "manual",
          isClientFacing: false,
          order: 1,
          assigneeRole: "senior",
          relativeDueReference: "job_end",
          relativeDueDays: -5,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Review payroll",
          taskType: "review",
          isClientFacing: false,
          order: 2,
          assigneeRole: "manager",
          relativeDueReference: "job_end",
          relativeDueDays: -3,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Client approval",
          taskType: "approval",
          isClientFacing: true,
          order: 3,
          assigneeRole: "senior",
          relativeDueReference: "job_end",
          relativeDueDays: -2,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Submit RTI",
          taskType: "filing_draft",
          isClientFacing: false,
          order: 4,
          assigneeRole: "senior",
          relativeDueReference: "job_end",
          relativeDueDays: 0,
          dependencies: [],
          isFromBlock: false,
        },
        {
          id: crypto.randomUUID(),
          name: "Distribute payslips",
          taskType: "manual",
          isClientFacing: false,
          order: 5,
          assigneeRole: "junior",
          relativeDueReference: "job_end",
          relativeDueDays: 0,
          dependencies: [],
          isFromBlock: false,
        },
      ],
    },
  },
];

// =====================================================
// DSL Resolver Functions
// =====================================================

export interface EntityContext {
  entityType?: "company" | "client";
  entityId?: string;
  organizationId?: string;
  company?: {
    id: string;
    company_name?: string | null;
    company_number?: string | null;
    vat_registered?: boolean;
    vat_stagger?: number | null;
    vat_stagger_group?: number | null;
    vat_frequency?: string | null;
    year_end_month?: number | null;
    year_end_day?: number | null;
    company_type?: string | null;
    vat_number?: string | null;
    vat_scheme?: string | null;
    status?: string | null;
  };
  client?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    status?: string | null;
    utr?: string | null;
  };
  engagement?: {
    service_code?: string | null;
    status?: string | null;
    billing_frequency?: string | null;
  };
  payroll?: {
    frequency?: string | null;
    pay_day?: number | null;
    employee_count?: number | null;
  };
  period?: {
    month?: number;
    quarter?: number;
    is_year_end?: boolean;
  };
}

/**
 * Resolves a field path from the entity context
 */
export function resolveFieldValue(field: string, context: EntityContext): unknown {
  const [category, property] = field.split(".");
  
  switch (category) {
    case "company":
      if (!context.company) return undefined;
      switch (property) {
        case "vat_stagger": return context.company.vat_stagger;
        case "vat_frequency": return context.company.vat_frequency;
        case "year_end_month": return context.company.year_end_month;
        case "year_end_day": return context.company.year_end_day;
        case "company_type": return context.company.company_type;
        case "vat_registered": return !!context.company.vat_number;
        case "vat_scheme": return context.company.vat_scheme;
        default: return undefined;
      }
    case "client":
      if (!context.client) return undefined;
      switch (property) {
        case "status": return context.client.status;
        case "has_utr": return !!context.client.utr;
        default: return undefined;
      }
    case "engagement":
      if (!context.engagement) return undefined;
      switch (property) {
        case "service_code": return context.engagement.service_code;
        case "status": return context.engagement.status;
        case "billing_frequency": return context.engagement.billing_frequency;
        default: return undefined;
      }
    case "payroll":
      if (!context.payroll) return undefined;
      switch (property) {
        case "frequency": return context.payroll.frequency;
        case "pay_day": return context.payroll.pay_day;
        case "employee_count": return context.payroll.employee_count;
        default: return undefined;
      }
    case "period":
      if (!context.period) return undefined;
      switch (property) {
        case "month": return context.period.month;
        case "quarter": return context.period.quarter;
        case "is_year_end": return context.period.is_year_end;
        default: return undefined;
      }
    default:
      return undefined;
  }
}

/**
 * Evaluates a single trigger condition against the entity context
 */
export function evaluateCondition(condition: TriggerCondition, context: EntityContext): boolean {
  const fieldValue = resolveFieldValue(condition.field, context);
  const { operator, value } = condition;

  switch (operator) {
    case "equals":
      return fieldValue === value;
    case "not_equals":
      return fieldValue !== value;
    case "in":
      return Array.isArray(value) && value.includes(fieldValue as string);
    case "not_in":
      return Array.isArray(value) && !value.includes(fieldValue as string);
    case "gt":
      return typeof fieldValue === "number" && typeof value === "number" && fieldValue > value;
    case "lt":
      return typeof fieldValue === "number" && typeof value === "number" && fieldValue < value;
    case "gte":
      return typeof fieldValue === "number" && typeof value === "number" && fieldValue >= value;
    case "lte":
      return typeof fieldValue === "number" && typeof value === "number" && fieldValue <= value;
    case "is_true":
      return fieldValue === true;
    case "is_false":
      return fieldValue === false;
    default:
      return false;
  }
}

/**
 * Evaluates all trigger conditions (AND logic)
 */
export function evaluateTriggerConditions(
  conditions: TriggerCondition[],
  context: EntityContext
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((condition) => evaluateCondition(condition, context));
}

/**
 * Evaluates entity filters to check if template applies
 */
export function evaluateEntityFilters(
  filters: EntityFilter | undefined,
  context: EntityContext
): boolean {
  if (!filters) return true;

  // Check entity type
  if (filters.entityType) {
    if (filters.entityType === "company" && !context.company) return false;
    if (filters.entityType === "client" && !context.client) return false;
  }

  // Check company types
  if (filters.companyTypes && filters.companyTypes.length > 0) {
    if (!context.company?.company_type) return false;
    if (!filters.companyTypes.includes(context.company.company_type)) return false;
  }

  // Check VAT registration
  if (filters.vatRegistered !== undefined) {
    const isVatRegistered = !!context.company?.vat_number;
    if (filters.vatRegistered !== isVatRegistered) return false;
  }

  // Check active status
  if (filters.excludeInactive) {
    if (context.client?.status === "archived" || context.client?.status === "disengaged") {
      return false;
    }
  }

  return true;
}

/**
 * Validates template content against schema
 */
export function validateTemplateContent(content: unknown): {
  success: boolean;
  data?: JobTemplateContent;
  errors?: string[];
} {
  try {
    const result = JobTemplateContentSchema.safeParse(content);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
    };
  } catch (error) {
    return { success: false, errors: [(error as Error).message] };
  }
}

/**
 * Validates template metadata against schema
 */
export function validateTemplateMetadata(metadata: unknown): {
  success: boolean;
  data?: JobTemplateMetadata;
  errors?: string[];
} {
  try {
    const result = JobTemplateMetadataSchema.safeParse(metadata);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
    };
  } catch (error) {
    return { success: false, errors: [(error as Error).message] };
  }
}
