/**
 * Filing Stage C (CT600) — real transport.
 * Submits a CT600 filing to HMRC via hmrc-ct-submit. The function itself enforces the approval
 * gate (validate_submission_integrity checks an active filing_approvals row + matching snapshot
 * hash), builds the real CT600 iXBRL + GovTalk, records the filing_submissions attempt, and
 * updates filings.status — so this is a thin, gated caller that surfaces the real result.
 */
import { supabase } from "@/integrations/supabase/client";

export interface SubmitCt600Result {
  success: boolean;
  error?: string;
}

/**
 * Submit an approved CT600 filing. 'test' (HMRC test environment) by default; 'production' must
 * be chosen explicitly. Returns the real transport result — on failure nothing is mutated beyond
 * what the function records, and it is retryable (hmrc-ct-submit dedupes in-flight/accepted
 * submissions).
 */
export async function submitCt600ToHmrc(
  filingId: string,
  environment: "test" | "production" = "test",
): Promise<SubmitCt600Result> {
  const { data, error } = await supabase.functions.invoke("hmrc-ct-submit", {
    body: { filingId, environment },
  });
  if (error) return { success: false, error: error.message };

  const res = (data ?? {}) as {
    success?: boolean;
    error?: string;
    message?: string;
    errors?: Array<{ code?: string; message?: string }>;
  };
  if (!res.success) {
    const detail =
      res.error ||
      res.message ||
      (Array.isArray(res.errors) ? res.errors.map((e) => e?.message).filter(Boolean).join("; ") : "") ||
      "HMRC did not accept the submission";
    return { success: false, error: detail };
  }
  return { success: true };
}
