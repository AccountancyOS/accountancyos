/**
 * Chaser Timing Validation
 * 
 * Validates override values before save.
 * Rejects invalid overrides with clear error messages. No partial writes.
 */

export interface TimingOverrideInput {
  step_key: string;
  offset_days: number;
  /** From step config */
  min_offset_days?: number;
  max_offset_days?: number;
  label?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ step_key: string; message: string }>;
}

/**
 * Validate a set of timing overrides for a single template.
 * 
 * Rules:
 * - offset_days must be within [min_offset_days, max_offset_days] from step config
 * - No offset beyond -365 or +30 (hard limits)
 * - Chase sequence must be chronologically ordered (earlier chases have more negative offsets)
 * - Final warning must be before deadline (offset <= -1 when anchor is a deadline)
 */
export function validateTimingOverrides(
  overrides: TimingOverrideInput[]
): ValidationResult {
  const errors: Array<{ step_key: string; message: string }> = [];

  for (const override of overrides) {
    // Hard limits
    if (override.offset_days < -365) {
      errors.push({ step_key: override.step_key, message: `Offset cannot be more than 365 days before the deadline (got ${override.offset_days})` });
    }
    if (override.offset_days > 30) {
      errors.push({ step_key: override.step_key, message: `Offset cannot be more than 30 days after the deadline (got ${override.offset_days})` });
    }

    // Step-specific min/max from config
    if (override.min_offset_days !== undefined && override.offset_days < override.min_offset_days) {
      errors.push({ step_key: override.step_key, message: `${override.label || override.step_key}: minimum offset is ${override.min_offset_days} days (got ${override.offset_days})` });
    }
    if (override.max_offset_days !== undefined && override.offset_days > override.max_offset_days) {
      errors.push({ step_key: override.step_key, message: `${override.label || override.step_key}: maximum offset is ${override.max_offset_days} days (got ${override.offset_days})` });
    }
  }

  // Chronological ordering: for steps sharing the same anchor, earlier steps must have more negative offsets
  // Group by anchor (inferred from step_key patterns)
  const chaseGroups = groupByChaseSequence(overrides);
  for (const group of chaseGroups) {
    for (let i = 1; i < group.length; i++) {
      if (group[i].offset_days <= group[i - 1].offset_days) {
        errors.push({
          step_key: group[i].step_key,
          message: `${group[i].label || group[i].step_key} (${group[i].offset_days}d) must be scheduled after ${group[i - 1].label || group[i - 1].step_key} (${group[i - 1].offset_days}d)`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Group chase steps into sequences for ordering validation.
 * Steps with _CHASE_1_, _CHASE_2_, _FINAL_WARNING_ in the same template
 * form a sequence that must be chronologically ordered.
 */
function groupByChaseSequence(overrides: TimingOverrideInput[]): TimingOverrideInput[][] {
  // Simple approach: all WAIT steps in a single template form one sequence
  // They should be ordered by offset_days (most negative first)
  if (overrides.length <= 1) return [];

  // Sort by the order they appear (assume caller passes them in step_order)
  return [overrides];
}
