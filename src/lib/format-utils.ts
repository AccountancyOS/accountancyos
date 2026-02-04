/**
 * Centralized Formatting Utilities
 * Use these functions for consistent date and currency formatting across the app
 */
import { format, formatDistanceToNow, parseISO, isValid } from "date-fns";

// Re-export formatCurrency from bookkeeping-utils for convenience
export { formatCurrency } from "./bookkeeping-utils";

/**
 * Standard date format patterns used across the application
 */
export const DATE_FORMATS = {
  short: "dd/MM/yyyy",
  long: "dd MMMM yyyy",
  iso: "yyyy-MM-dd",
  datetime: "dd/MM/yyyy HH:mm",
  monthYear: "MMM yyyy",
  dayMonthYear: "dd MMM yyyy",
} as const;

export type DateFormatType = keyof typeof DATE_FORMATS;

/**
 * Parse a date value that could be a string, Date, null, or undefined
 */
function parseDate(date: string | Date | null | undefined): Date | null {
  if (!date) return null;
  
  if (date instanceof Date) {
    return isValid(date) ? date : null;
  }
  
  try {
    const parsed = parseISO(date);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Format a date value using a predefined format
 * @param date - The date to format (string, Date, null, or undefined)
 * @param formatType - The format type to use (defaults to "short")
 * @returns Formatted date string or "—" if invalid/null
 */
export function formatDate(
  date: string | Date | null | undefined,
  formatType: DateFormatType = "short"
): string {
  const parsed = parseDate(date);
  if (!parsed) return "—";
  return format(parsed, DATE_FORMATS[formatType]);
}

/**
 * Format a date as relative time (e.g., "2 hours ago", "in 3 days")
 * @param date - The date to format
 * @returns Relative time string or "—" if invalid/null
 */
export function formatRelativeDate(date: string | Date | null | undefined): string {
  const parsed = parseDate(date);
  if (!parsed) return "—";
  return formatDistanceToNow(parsed, { addSuffix: true });
}

/**
 * Format a date with a custom format string (for cases not covered by predefined formats)
 * @param date - The date to format
 * @param formatString - The date-fns format string
 * @returns Formatted date string or "—" if invalid/null
 */
export function formatDateCustom(
  date: string | Date | null | undefined,
  formatString: string
): string {
  const parsed = parseDate(date);
  if (!parsed) return "—";
  return format(parsed, formatString);
}

/**
 * Format a number as a percentage
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted percentage string or "—" if invalid/null
 */
export function formatPercentage(
  value: number | null | undefined,
  decimals: number = 0
): string {
  if (value == null) return "—";
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format a number with thousand separators
 * @param value - The number to format
 * @returns Formatted number string or "—" if invalid/null
 */
export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-GB").format(value);
}
