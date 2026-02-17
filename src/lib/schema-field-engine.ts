/**
 * Schema Field Engine
 * Canonical field schema definitions used by workpaper templates and filing schedules.
 * Defines sections, fields with types, validation rules, and computation mapping keys.
 */

// ==================== FIELD TYPES ====================

export type FieldType = 
  | 'money' 
  | 'number' 
  | 'date' 
  | 'text' 
  | 'boolean' 
  | 'enum' 
  | 'table_grid';

export interface EnumOption {
  value: string;
  label: string;
}

export interface TableGridColumn {
  key: string;
  label: string;
  type: Exclude<FieldType, 'table_grid'>;
  width?: string;
  enum_options?: EnumOption[];
}

// ==================== VALIDATION RULES ====================

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'min_value' | 'max_value' | 'pattern' | 'cross_field';
  value?: number | string;
  /** For cross_field rules: expression referencing other fields */
  expression?: string;
  message: string;
}

// ==================== FIELD DEFINITION ====================

export interface FieldDefinition {
  /** Canonical key, e.g. 'employment.p60.gross_pay' */
  key: string;
  label: string;
  type: FieldType;
  /** Help text shown to user */
  help?: string;
  /** Default value */
  default_value?: unknown;
  /** For enum fields */
  enum_options?: EnumOption[];
  /** For table_grid fields */
  columns?: TableGridColumn[];
  /** Validation rules */
  validations?: ValidationRule[];
  /** Computation mapping key — used by engines to read/write values */
  computation_key?: string;
  /** Whether this field is read-only (computed) */
  readonly?: boolean;
  /** Source: 'manual' | 'computed' | 'auto_populated' */
  source?: 'manual' | 'computed' | 'auto_populated';
  /** Whether to show this field in summary views */
  show_in_summary?: boolean;
}

// ==================== SECTION DEFINITION ====================

export interface SectionDefinition {
  /** Unique section key, e.g. 'employment' */
  key: string;
  title: string;
  help?: string;
  /** Display order */
  order: number;
  /** Whether this section is optional/collapsible */
  optional?: boolean;
  fields: FieldDefinition[];
}

// ==================== SCHEMA DEFINITION ====================

export interface SchemaDefinition {
  /** Schema identifier, e.g. 'sa_non_mtd' */
  schema_id: string;
  name: string;
  version: string;
  sections: SectionDefinition[];
}

// ==================== VALIDATION ENGINE ====================

export interface ValidationError {
  field_key: string;
  section_key: string;
  rule_type: string;
  message: string;
}

/**
 * Validate a set of field values against a schema definition.
 */
export function validateSchema(
  schema: SchemaDefinition,
  values: Record<string, unknown>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const section of schema.sections) {
    for (const field of section.fields) {
      const value = getNestedValue(values, field.key);
      
      if (!field.validations) continue;

      for (const rule of field.validations) {
        const error = validateField(field, value, rule, values);
        if (error) {
          errors.push({
            field_key: field.key,
            section_key: section.key,
            rule_type: rule.type,
            message: error,
          });
        }
      }
    }
  }

  return errors;
}

function validateField(
  field: FieldDefinition,
  value: unknown,
  rule: ValidationRule,
  allValues: Record<string, unknown>
): string | null {
  switch (rule.type) {
    case 'required':
      if (value === undefined || value === null || value === '') {
        return rule.message;
      }
      break;
    case 'min_value':
      if (typeof value === 'number' && typeof rule.value === 'number' && value < rule.value) {
        return rule.message;
      }
      break;
    case 'max_value':
      if (typeof value === 'number' && typeof rule.value === 'number' && value > rule.value) {
        return rule.message;
      }
      break;
    case 'pattern':
      if (typeof value === 'string' && typeof rule.value === 'string') {
        const re = new RegExp(rule.value);
        if (!re.test(value)) {
          return rule.message;
        }
      }
      break;
    case 'cross_field':
      // Cross-field rules use simple expressions — evaluated at compute time
      // Implementation deferred to specific schedule engines
      break;
  }
  return null;
}

/**
 * Get a nested value from a flat or nested object using dot-notation key.
 */
export function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a nested value in an object using dot-notation key.
 */
export function setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Extract all values from a schema into a flat canonical-key map.
 */
export function flattenValues(
  values: Record<string, unknown>,
  schema: SchemaDefinition
): Map<string, unknown> {
  const result = new Map<string, unknown>();
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const value = getNestedValue(values, field.key);
      if (value !== undefined) {
        result.set(field.key, value);
      }
    }
  }
  return result;
}

/**
 * Get all computation keys from a schema.
 */
export function getComputationKeys(schema: SchemaDefinition): string[] {
  const keys: string[] = [];
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.computation_key) {
        keys.push(field.computation_key);
      }
    }
  }
  return keys;
}
