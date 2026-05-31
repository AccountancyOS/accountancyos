import { useEffect, useRef } from "react";

/**
 * Persists wizard step form state to localStorage so partially-filled
 * inputs survive navigation away from /onboarding-wizard.
 *
 * Pattern:
 *   1. Component sets initial useState from `loadWizardDraft(...)` (sync read).
 *   2. Component calls `useWizardDraft(stepKey, organizationId, value)` to
 *      autosave on every change.
 *   3. On successful DB submit, call `clearWizardDraft(stepKey, organizationId)`.
 *
 * Keys are namespaced by organization so different practices on the same
 * machine never leak into each other.
 */

const PREFIX = "onboarding_wizard_draft";

const buildKey = (stepKey: string, organizationId: string | undefined | null) =>
  organizationId ? `${PREFIX}:${stepKey}:${organizationId}` : null;

export const loadWizardDraft = <T>(
  stepKey: string,
  organizationId: string | undefined | null,
): T | null => {
  const key = buildKey(stepKey, organizationId);
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const clearWizardDraft = (
  stepKey: string,
  organizationId: string | undefined | null,
) => {
  const key = buildKey(stepKey, organizationId);
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
};

export const useWizardDraft = <T>(
  stepKey: string,
  organizationId: string | undefined | null,
  value: T,
) => {
  // Avoid writing the very first render's value back over a freshly-loaded
  // draft if callers happen to pass a default before hydration. Callers that
  // seed state from `loadWizardDraft` are safe either way.
  const first = useRef(true);
  useEffect(() => {
    const key = buildKey(stepKey, organizationId);
    if (!key || typeof window === "undefined") return;
    if (first.current) {
      first.current = false;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* noop */
    }
  }, [stepKey, organizationId, value]);
};