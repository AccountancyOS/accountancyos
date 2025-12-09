import { z } from "zod";

// Common validators
const emailSchema = z
  .string()
  .trim()
  .email({ message: "Invalid email address" })
  .max(255, { message: "Email must be less than 255 characters" });

const phoneSchema = z
  .string()
  .trim()
  .max(20, { message: "Phone must be less than 20 characters" })
  .regex(/^[+\d\s()-]*$/, { message: "Invalid phone number format" })
  .optional()
  .or(z.literal(""));

const nameSchema = z
  .string()
  .trim()
  .min(1, { message: "This field is required" })
  .max(100, { message: "Must be less than 100 characters" });

const optionalStringSchema = z
  .string()
  .trim()
  .max(500, { message: "Must be less than 500 characters" })
  .optional()
  .or(z.literal(""));

// Client schemas
export const individualClientSchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
});

export const companyClientSchema = z.object({
  company_name: z
    .string()
    .trim()
    .min(1, { message: "Company name is required" })
    .max(200, { message: "Company name must be less than 200 characters" }),
  email: emailSchema,
  phone: phoneSchema,
  company_number: z
    .string()
    .trim()
    .max(20, { message: "Company number must be less than 20 characters" })
    .regex(/^[A-Z0-9]*$/i, { message: "Invalid company number format" })
    .optional()
    .or(z.literal("")),
});

// Lead schema
export const leadSchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  source: z.enum(["website", "referral", "social", "cold_outreach", "networking", "other"]).optional(),
  estimated_monthly_value: z
    .number()
    .min(0, { message: "Value must be positive" })
    .max(1000000, { message: "Value seems too high" })
    .optional()
    .nullable(),
  notes: z
    .string()
    .trim()
    .max(2000, { message: "Notes must be less than 2000 characters" })
    .optional()
    .or(z.literal("")),
});

// Job schema
export const jobSchema = z.object({
  job_name: z
    .string()
    .trim()
    .min(1, { message: "Job name is required" })
    .max(200, { message: "Job name must be less than 200 characters" }),
  client_id: z.string().uuid({ message: "Please select a client or company" }).optional(),
  company_id: z.string().uuid({ message: "Please select a client or company" }).optional(),
  service_type: z
    .string()
    .min(1, { message: "Service type is required" }),
  status: z.enum(["not_started", "in_progress", "waiting_on_client", "with_reviewer", "complete", "blocked"]),
  priority: z.enum(["low", "normal", "high", "critical"]),
  filing_deadline: z
    .string()
    .optional()
    .or(z.literal("")),
});

// Invoice schema
export const invoiceSchema = z.object({
  contact_name: z
    .string()
    .trim()
    .min(1, { message: "Contact name is required" })
    .max(200, { message: "Contact name must be less than 200 characters" }),
  contact_email: emailSchema.optional().or(z.literal("")),
  invoice_number: z
    .string()
    .trim()
    .max(50, { message: "Invoice number must be less than 50 characters" })
    .optional()
    .or(z.literal("")),
  reference: optionalStringSchema,
  issue_date: z.string().min(1, { message: "Issue date is required" }),
  due_date: z.string().min(1, { message: "Due date is required" }),
  notes: z
    .string()
    .trim()
    .max(2000, { message: "Notes must be less than 2000 characters" })
    .optional()
    .or(z.literal("")),
});

export const invoiceLineSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, { message: "Description is required" })
    .max(500, { message: "Description must be less than 500 characters" }),
  quantity: z
    .number()
    .min(0.01, { message: "Quantity must be greater than 0" })
    .max(999999, { message: "Quantity is too large" }),
  unit_price: z
    .number()
    .min(0, { message: "Price must be positive" })
    .max(99999999, { message: "Price is too large" }),
  account_id: z.string().uuid({ message: "Please select an account" }),
  vat_code_id: z.string().uuid().optional().or(z.literal("")),
  vat_rate: z
    .number()
    .min(0, { message: "VAT rate must be positive" })
    .max(100, { message: "VAT rate cannot exceed 100%" }),
});

// Task schema
export const taskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { message: "Task title is required" })
    .max(200, { message: "Title must be less than 200 characters" }),
  description: z
    .string()
    .trim()
    .max(2000, { message: "Description must be less than 2000 characters" })
    .optional()
    .or(z.literal("")),
  due_date: z.string().optional().or(z.literal("")),
  visibility: z.enum(["internal", "portal"]),
});

// Automation rule schema
export const automationRuleSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Rule name is required" })
    .max(200, { message: "Rule name must be less than 200 characters" }),
  trigger_type: z.string().min(1, { message: "Please select a trigger" }),
  action_type: z.string().min(1, { message: "Please select an action" }),
  trigger_config: z.record(z.any()).optional(),
  action_config: z.record(z.any()).optional(),
});

// Bill schema
export const billSchema = z.object({
  supplier_name: z
    .string()
    .trim()
    .min(1, { message: "Supplier name is required" })
    .max(200, { message: "Supplier name must be less than 200 characters" }),
  bill_number: z
    .string()
    .trim()
    .max(50, { message: "Bill number must be less than 50 characters" })
    .optional()
    .or(z.literal("")),
  issue_date: z.string().min(1, { message: "Issue date is required" }),
  due_date: z.string().min(1, { message: "Due date is required" }),
  reference: optionalStringSchema,
  notes: z
    .string()
    .trim()
    .max(2000, { message: "Notes must be less than 2000 characters" })
    .optional()
    .or(z.literal("")),
});

// Journal entry schema
export const journalEntrySchema = z.object({
  date: z.string().min(1, { message: "Date is required" }),
  description: z
    .string()
    .trim()
    .min(1, { message: "Description is required" })
    .max(500, { message: "Description must be less than 500 characters" }),
  reference: optionalStringSchema,
});

export const journalLineSchema = z.object({
  account_id: z.string().uuid({ message: "Please select an account" }),
  debit: z.number().min(0, { message: "Debit must be positive" }).optional(),
  credit: z.number().min(0, { message: "Credit must be positive" }).optional(),
  description: z
    .string()
    .trim()
    .max(500, { message: "Description must be less than 500 characters" })
    .optional()
    .or(z.literal("")),
}).refine((data) => (data.debit ?? 0) > 0 || (data.credit ?? 0) > 0, {
  message: "Either debit or credit must have a value",
}).refine((data) => !((data.debit ?? 0) > 0 && (data.credit ?? 0) > 0), {
  message: "Cannot have both debit and credit on the same line",
});

// Employee schema
export const employeeSchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
  email: emailSchema,
  national_insurance_number: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}\d{6}[A-D]$/i, { message: "Invalid NI number format (e.g., AB123456C)" })
    .optional()
    .or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  start_date: z.string().min(1, { message: "Start date is required" }),
  tax_code: z
    .string()
    .trim()
    .max(10, { message: "Tax code must be less than 10 characters" })
    .optional()
    .or(z.literal("")),
  annual_salary: z
    .number()
    .min(0, { message: "Salary must be positive" })
    .max(10000000, { message: "Salary seems too high" })
    .optional(),
});

// Supplier schema
export const supplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Supplier name is required" })
    .max(200, { message: "Supplier name must be less than 200 characters" }),
  email: emailSchema.optional().or(z.literal("")),
  phone: phoneSchema,
  account_number: z
    .string()
    .trim()
    .max(50, { message: "Account number must be less than 50 characters" })
    .optional()
    .or(z.literal("")),
  sort_code: z
    .string()
    .trim()
    .regex(/^\d{2}-\d{2}-\d{2}$|^\d{6}$|^$/, { message: "Invalid sort code format" })
    .optional()
    .or(z.literal("")),
});

// Customer schema
export const customerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Customer name is required" })
    .max(200, { message: "Customer name must be less than 200 characters" }),
  email: emailSchema.optional().or(z.literal("")),
  phone: phoneSchema,
  address: z
    .string()
    .trim()
    .max(500, { message: "Address must be less than 500 characters" })
    .optional()
    .or(z.literal("")),
});

// Utility function to safely validate and get errors
export function validateForm<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: boolean;
  data?: T;
  errors?: Record<string, string>;
} {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors: Record<string, string> = {};
  result.error.errors.forEach((err) => {
    const path = err.path.join(".");
    if (!errors[path]) {
      errors[path] = err.message;
    }
  });
  
  return { success: false, errors };
}

// Type exports
export type IndividualClientForm = z.infer<typeof individualClientSchema>;
export type CompanyClientForm = z.infer<typeof companyClientSchema>;
export type LeadForm = z.infer<typeof leadSchema>;
export type JobForm = z.infer<typeof jobSchema>;
export type InvoiceForm = z.infer<typeof invoiceSchema>;
export type TaskForm = z.infer<typeof taskSchema>;
export type AutomationRuleForm = z.infer<typeof automationRuleSchema>;
export type EmployeeForm = z.infer<typeof employeeSchema>;
export type SupplierForm = z.infer<typeof supplierSchema>;
export type CustomerForm = z.infer<typeof customerSchema>;
