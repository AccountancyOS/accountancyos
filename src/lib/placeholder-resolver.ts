import { format } from "date-fns";

// Placeholder context types
export interface PlaceholderContext {
  client?: {
    id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    status?: string;
  };
  company?: {
    id?: string;
    company_name?: string;
    company_number?: string;
    vat_registered?: boolean;
    vat_frequency?: string | null;
    year_end_month?: number;
    year_end_day?: number;
    status?: string;
  };
  job?: {
    id?: string;
    job_name?: string;
    service_type?: string;
    status?: string;
  };
  deadline?: {
    id?: string;
    name?: string;
    due_date?: string;
    filing_body?: string;
  };
  filing?: {
    id?: string;
    filing_type?: string;
    status?: string;
  };
  organization?: {
    id?: string;
    name?: string;
  };
  period?: {
    start?: Date;
    end?: Date;
  };
}

interface PlaceholderDefinition {
  key: string;
  resolver: (context: PlaceholderContext) => string;
}

// All available placeholders
const PLACEHOLDER_DEFINITIONS: PlaceholderDefinition[] = [
  // Client placeholders
  { key: "{{client.name}}", resolver: (ctx) => ctx.client ? `${ctx.client.first_name || ''} ${ctx.client.last_name || ''}`.trim() : "" },
  { key: "{{client.first_name}}", resolver: (ctx) => ctx.client?.first_name || "" },
  { key: "{{client.last_name}}", resolver: (ctx) => ctx.client?.last_name || "" },
  { key: "{{client.email}}", resolver: (ctx) => ctx.client?.email || "" },
  { key: "{{client.phone}}", resolver: (ctx) => ctx.client?.phone || "" },
  
  // Company placeholders
  { key: "{{company.name}}", resolver: (ctx) => ctx.company?.company_name || "" },
  { key: "{{company.number}}", resolver: (ctx) => ctx.company?.company_number || "" },
  { key: "{{company.vat_registered}}", resolver: (ctx) => ctx.company?.vat_registered ? "Yes" : "No" },
  { key: "{{company.year_end}}", resolver: (ctx) => {
    if (!ctx.company?.year_end_month || !ctx.company?.year_end_day) return "";
    const now = new Date();
    const yearEnd = new Date(now.getFullYear(), ctx.company.year_end_month - 1, ctx.company.year_end_day);
    return format(yearEnd, "dd MMMM");
  }},
  
  // Job placeholders
  { key: "{{job.name}}", resolver: (ctx) => ctx.job?.job_name || "" },
  { key: "{{job.service_type}}", resolver: (ctx) => ctx.job?.service_type || "" },
  { key: "{{job.status}}", resolver: (ctx) => ctx.job?.status || "" },
  
  // Deadline placeholders
  { key: "{{deadline.name}}", resolver: (ctx) => ctx.deadline?.name || "" },
  { key: "{{deadline.due_date}}", resolver: (ctx) => ctx.deadline?.due_date ? format(new Date(ctx.deadline.due_date), "dd MMM yyyy") : "" },
  { key: "{{deadline.days_remaining}}", resolver: (ctx) => {
    if (!ctx.deadline?.due_date) return "";
    const days = Math.ceil((new Date(ctx.deadline.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return `${days}`;
  }},
  
  // Filing placeholders
  { key: "{{filing.type}}", resolver: (ctx) => ctx.filing?.filing_type || "" },
  { key: "{{filing.status}}", resolver: (ctx) => ctx.filing?.status || "" },
  
  // Organization placeholders
  { key: "{{organization.name}}", resolver: (ctx) => ctx.organization?.name || "" },
  
  // Period placeholders
  { key: "{{period}}", resolver: (ctx) => {
    if (!ctx.period?.start || !ctx.period?.end) return "";
    return `${format(ctx.period.start, "MMM yyyy")} - ${format(ctx.period.end, "MMM yyyy")}`;
  }},
  { key: "{{period.start}}", resolver: (ctx) => ctx.period?.start ? format(ctx.period.start, "dd MMM yyyy") : "" },
  { key: "{{period.end}}", resolver: (ctx) => ctx.period?.end ? format(ctx.period.end, "dd MMM yyyy") : "" },
  { key: "{{period.quarter}}", resolver: (ctx) => {
    if (!ctx.period?.end) return "";
    const q = Math.ceil((ctx.period.end.getMonth() + 1) / 3);
    return `Q${q} ${format(ctx.period.end, "yyyy")}`;
  }},
];

/**
 * Resolve all placeholders in a text string with actual values
 */
export function resolvePlaceholders(text: string, context: PlaceholderContext): string {
  if (!text) return text;
  
  let result = text;
  for (const placeholder of PLACEHOLDER_DEFINITIONS) {
    result = result.replace(new RegExp(escapeRegExp(placeholder.key), 'g'), placeholder.resolver(context));
  }
  return result;
}

/**
 * Resolve placeholders in all string values of an object recursively
 */
export function resolveObjectPlaceholders<T extends Record<string, unknown>>(
  obj: T,
  context: PlaceholderContext
): T {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = resolvePlaceholders(value, context);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = resolveObjectPlaceholders(value as Record<string, unknown>, context);
    } else {
      result[key] = value;
    }
  }
  
  return result as T;
}

/**
 * Get list of all available placeholders grouped by category
 */
export function getAvailablePlaceholders(): { category: string; placeholders: { key: string; label: string }[] }[] {
  return [
    {
      category: "Client",
      placeholders: [
        { key: "{{client.name}}", label: "Full Name" },
        { key: "{{client.first_name}}", label: "First Name" },
        { key: "{{client.last_name}}", label: "Last Name" },
        { key: "{{client.email}}", label: "Email" },
        { key: "{{client.phone}}", label: "Phone" },
      ],
    },
    {
      category: "Company",
      placeholders: [
        { key: "{{company.name}}", label: "Company Name" },
        { key: "{{company.number}}", label: "Company Number" },
        { key: "{{company.vat_registered}}", label: "VAT Registered" },
        { key: "{{company.year_end}}", label: "Year End Date" },
      ],
    },
    {
      category: "Job",
      placeholders: [
        { key: "{{job.name}}", label: "Job Name" },
        { key: "{{job.service_type}}", label: "Service Type" },
        { key: "{{job.status}}", label: "Status" },
      ],
    },
    {
      category: "Deadline",
      placeholders: [
        { key: "{{deadline.name}}", label: "Deadline Name" },
        { key: "{{deadline.due_date}}", label: "Due Date" },
        { key: "{{deadline.days_remaining}}", label: "Days Remaining" },
      ],
    },
    {
      category: "Filing",
      placeholders: [
        { key: "{{filing.type}}", label: "Filing Type" },
        { key: "{{filing.status}}", label: "Status" },
      ],
    },
    {
      category: "Organization",
      placeholders: [
        { key: "{{organization.name}}", label: "Practice Name" },
      ],
    },
    {
      category: "Period",
      placeholders: [
        { key: "{{period}}", label: "Full Period" },
        { key: "{{period.start}}", label: "Period Start" },
        { key: "{{period.end}}", label: "Period End" },
        { key: "{{period.quarter}}", label: "Quarter" },
      ],
    },
  ];
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
