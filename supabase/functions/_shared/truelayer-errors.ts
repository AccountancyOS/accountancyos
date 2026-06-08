// Maps internal/provider errors into a safe internal code + client-safe
// message. Never put provider tokens or raw provider error bodies into
// either field — accountant UI shows the internal code, portal UI shows
// only the client_safe_message.

export interface MappedTrueLayerError {
  internal_code:
    | "action_required"
    | "expired"
    | "sync_failed"
    | "sync_delayed"
    | "not_configured"
    | "unknown";
  client_safe_message: string;
  http_status: number;
}

export function mapTrueLayerError(input: unknown): MappedTrueLayerError {
  const raw = typeof input === "string"
    ? input
    : (input as { message?: string; code?: string; status?: number } | null)?.message ?? "";
  const status = typeof input === "object" && input !== null
    ? (input as { status?: number }).status
    : undefined;
  const lower = (raw || "").toLowerCase();

  if (lower.includes("invalid_grant") || lower.includes("token") && lower.includes("revoked")) {
    return {
      internal_code: "action_required",
      client_safe_message: "Reconnect required.",
      http_status: 401,
    };
  }
  if (lower.includes("consent_expired") || lower.includes("expired")) {
    return {
      internal_code: "expired",
      client_safe_message: "Bank connection expired. Reconnect bank.",
      http_status: 401,
    };
  }
  if (status === 429 || lower.includes("rate") && lower.includes("limit")) {
    return {
      internal_code: "sync_delayed",
      client_safe_message: "Sync delayed - please try again shortly.",
      http_status: 429,
    };
  }
  if ((status && status >= 500) || lower.includes("unavailable")) {
    return {
      internal_code: "sync_failed",
      client_safe_message: "Sync failed - try later.",
      http_status: 502,
    };
  }
  if (lower.includes("not configured") || lower.includes("truelayer config missing")) {
    return {
      internal_code: "not_configured",
      client_safe_message: "Open Banking is not configured.",
      http_status: 503,
    };
  }
  return {
    internal_code: "sync_failed",
    client_safe_message: "Sync failed - contact your accountant.",
    http_status: 500,
  };
}