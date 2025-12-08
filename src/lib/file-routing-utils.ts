import { format } from "date-fns";
import { EntityContext } from "./job-template-types";

/**
 * Resolves placeholders in a target folder template string
 * 
 * Supported placeholders:
 * - {{period}} → "2024-Q2" or "2024-04-01_2024-06-30"
 * - {{period.year}} → "2024"
 * - {{period.quarter}} → "Q2"
 * - {{company.name}} → "Acme Ltd"
 * - {{client.name}} → "John Smith"
 * - {{service_code}} → "VAT"
 * - {{date}} → current date
 */
export function resolveTargetFolder(
  template: string,
  context: EntityContext & { 
    periodStart?: Date; 
    periodEnd?: Date;
    serviceCode?: string;
  }
): string {
  if (!template) return "";

  let resolved = template;

  // Period placeholders
  if (context.periodStart && context.periodEnd) {
    const quarter = `Q${Math.ceil((context.periodEnd.getMonth() + 1) / 3)}`;
    const year = context.periodEnd.getFullYear().toString();
    const periodLabel = `${year}-${quarter}`;
    const periodRange = `${format(context.periodStart, "yyyy-MM-dd")}_${format(context.periodEnd, "yyyy-MM-dd")}`;
    
    resolved = resolved
      .replace(/\{\{period\.year\}\}/g, year)
      .replace(/\{\{period\.quarter\}\}/g, quarter)
      .replace(/\{\{period\}\}/g, periodLabel)
      .replace(/\{\{period\.range\}\}/g, periodRange);
  }

  // Company placeholders
  if (context.company) {
    const companyName = sanitizePathSegment(context.company.company_name || "Unknown");
    resolved = resolved
      .replace(/\{\{company\.name\}\}/g, companyName)
      .replace(/\{\{company\.number\}\}/g, context.company.company_number || "");
  }

  // Client placeholders
  if (context.client) {
    const clientName = sanitizePathSegment(
      `${context.client.first_name} ${context.client.last_name}`.trim() || "Unknown"
    );
    resolved = resolved
      .replace(/\{\{client\.name\}\}/g, clientName)
      .replace(/\{\{client\.first_name\}\}/g, context.client.first_name || "")
      .replace(/\{\{client\.last_name\}\}/g, context.client.last_name || "");
  }

  // Service code placeholder
  if (context.serviceCode) {
    resolved = resolved.replace(/\{\{service_code\}\}/g, context.serviceCode);
  }

  // Date placeholder
  resolved = resolved.replace(/\{\{date\}\}/g, format(new Date(), "yyyy-MM-dd"));

  // Clean up any remaining unresolved placeholders
  resolved = resolved.replace(/\{\{[^}]+\}\}/g, "");

  // Clean up double slashes and trailing slashes
  resolved = resolved.replace(/\/+/g, "/").replace(/\/$/, "");

  return resolved;
}

/**
 * Sanitizes a string for use as a path segment
 * Removes or replaces characters that are invalid in file paths
 */
function sanitizePathSegment(input: string): string {
  return input
    .replace(/[<>:"|?*\\]/g, "") // Remove invalid characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Builds semantic tags for an uploaded file based on context
 */
export function buildFileTags(
  requestType: string | null,
  context: EntityContext & {
    periodStart?: Date;
    periodEnd?: Date;
    serviceCode?: string;
    jobId?: string;
    taskTitle?: string;
  }
): string[] {
  const tags: string[] = [];

  // Request type tag
  if (requestType) {
    tags.push(requestType);
  }

  // Service code tag
  if (context.serviceCode) {
    tags.push(context.serviceCode.toLowerCase());
  }

  // Period tags
  if (context.periodEnd) {
    const quarter = `Q${Math.ceil((context.periodEnd.getMonth() + 1) / 3)}`;
    const year = context.periodEnd.getFullYear().toString();
    tags.push(`${year}-${quarter}`);
  }

  // Entity type tag
  tags.push(context.entityType);

  return tags;
}

/**
 * Generates a storage path for a file upload
 */
export function generateStoragePath(
  organizationId: string,
  entityType: "company" | "client",
  entityId: string,
  targetFolder: string,
  fileName: string
): string {
  const basePath = `${organizationId}/${entityType}s/${entityId}`;
  const folder = targetFolder || "uploads";
  
  // Add timestamp to prevent collisions
  const timestamp = Date.now();
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";
  const baseName = fileName.replace(/\.[^/.]+$/, "");
  const uniqueFileName = `${baseName}_${timestamp}${extension ? `.${extension}` : ""}`;
  
  return `${basePath}/${folder}/${uniqueFileName}`;
}
