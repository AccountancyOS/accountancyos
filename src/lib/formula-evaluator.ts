/**
 * Safe formula evaluator for workpaper calculations
 * 
 * SECURITY: This replaces eval() with math.js which provides
 * a sandboxed expression parser that cannot execute arbitrary code.
 */

import { evaluate, parse } from 'mathjs';

export type FormulaScope = Record<string, number | boolean | string | null>;

// Hard whitelist of allowed identifier patterns
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Maximum formula length to prevent DoS
const MAX_FORMULA_LENGTH = 500;

// Blocked patterns that should never appear in formulas
const BLOCKED_PATTERNS = [
  /\beval\b/i,
  /\bFunction\b/,
  /\bconstructor\b/,
  /\bprocess\b/,
  /\bglobalThis\b/,
  /\bwindow\b/,
  /\bdocument\b/,
  /\brequire\b/,
  /\bimport\b/,
  /\bfetch\b/,
  /\bXMLHttpRequest\b/,
  /\b__proto__\b/,
  /\bprototype\b/,
];

/**
 * Validate that scope only contains safe primitive values
 */
function assertSafeScope(scope: FormulaScope): void {
  for (const key of Object.keys(scope)) {
    if (!SAFE_IDENTIFIER.test(key)) {
      throw new Error(`Unsafe variable name: ${key}`);
    }
    
    const value = scope[key];
    
    // Block functions
    if (typeof value === 'function') {
      throw new Error(`Unsafe value for ${key}: functions not allowed`);
    }
    
    // Block objects (except null)
    if (value !== null && typeof value === 'object') {
      throw new Error(`Unsafe value for ${key}: objects not allowed`);
    }
  }
}

/**
 * Check formula for blocked patterns
 */
function assertSafeFormula(expression: string): void {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(expression)) {
      throw new Error(`Formula contains blocked pattern: ${pattern.source}`);
    }
  }
  
  // Block suspicious characters that have no place in math formulas
  if (/[`\\]/.test(expression)) {
    throw new Error('Formula contains unsupported characters');
  }
}

/**
 * Safely evaluate a mathematical formula with given scope variables
 * 
 * @param expression - The formula string (e.g., "gross_pay * 0.2")
 * @param scope - Object mapping variable names to their values
 * @returns The computed numeric result
 * @throws Error if formula is invalid, contains blocked patterns, or doesn't evaluate to a number
 */
export function evaluateFormula(expression: string, scope: FormulaScope): number {
  // Validate expression exists
  if (!expression || typeof expression !== 'string') {
    throw new Error('Formula expression missing or invalid');
  }
  
  // Trim and check length
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    throw new Error('Formula expression is empty');
  }
  
  if (trimmed.length > MAX_FORMULA_LENGTH) {
    throw new Error(`Formula too long (max ${MAX_FORMULA_LENGTH} characters)`);
  }
  
  // Security checks
  assertSafeFormula(trimmed);
  assertSafeScope(scope);
  
  try {
    // Parse first to validate syntax (catches malformed expressions early)
    parse(trimmed);
    
    // Convert scope values to numbers where possible for math.js
    const numericScope: Record<string, number> = {};
    for (const [key, value] of Object.entries(scope)) {
      if (typeof value === 'number') {
        numericScope[key] = value;
      } else if (typeof value === 'boolean') {
        numericScope[key] = value ? 1 : 0;
      } else if (typeof value === 'string') {
        const parsed = parseFloat(value);
        numericScope[key] = isNaN(parsed) ? 0 : parsed;
      } else {
        numericScope[key] = 0;
      }
    }
    
    // Evaluate using math.js (sandboxed, no access to JS globals)
    const result = evaluate(trimmed, numericScope);
    
    // Ensure result is a valid number
    if (typeof result !== 'number') {
      // math.js might return other types for some expressions
      const numResult = Number(result);
      if (isNaN(numResult) || !isFinite(numResult)) {
        throw new Error('Formula did not evaluate to a finite number');
      }
      return numResult;
    }
    
    if (isNaN(result) || !isFinite(result)) {
      throw new Error('Formula did not evaluate to a finite number');
    }
    
    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Formula evaluation failed: ${error.message}`);
    }
    throw new Error('Formula evaluation failed: unknown error');
  }
}

/**
 * Test if an expression is valid without evaluating it
 */
export function isValidFormula(expression: string): boolean {
  try {
    if (!expression || typeof expression !== 'string') return false;
    const trimmed = expression.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_FORMULA_LENGTH) return false;
    
    assertSafeFormula(trimmed);
    parse(trimmed);
    return true;
  } catch {
    return false;
  }
}
