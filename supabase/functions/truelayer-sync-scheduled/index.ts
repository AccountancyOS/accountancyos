// Scheduled TrueLayer sync. Invoked by pg_cron via pg_net with the
// `x-cron-secret` header. Iterates active, non-expired bank_connections
// in bounded batches; each connection runs its own try/catch and writes
// a bank_sync_logs row.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTrueLayerConfig, TrueLayerConfigError } from "../_shared/truelayer-config.ts";
import { mapTrueLayerError } from "../_shared/truelayer-errors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET");

const BATCH_SIZE = parseInt(Deno.env.get("TL_SCHED_BATCH_SIZE") || "25", 10);
const MAX_CONCURRENCY = parseInt(Deno.env.get("TL_SCHED_MAX_CONCURRENCY") || "5", 10);

async function syncConnection(supabase: any, tl: any, connection: any) {
  const logInsert = await supabase
    .from("bank_sync_logs")
    .insert({
      organization_id: connection.organization_id,
      bank_connection_id: connection.id,
      client_id: connection.client_id || null,
      company_id: connection.company_id || null,
      triggered_by: "scheduled",
      status: "running",
    })
    .select("id")
    .single();
  const logId = logInsert.data?.id as string | undefined;

  let imported = 0;
  let updated = 0;
  let failed = false;
  let firstErr: ReturnType<typeof mapTrueLayerError> | null = null;

  try {
    // Refresh token if needed.
    const expiresAt = connection.consent_expires_at ? new Date(connection.consent_expires_at) : null;
    let accessToken = connection.access_token;
    if (expiresAt && (expiresAt.getTime() - Date.now()) / 86_400_000 < 7 && connection.refresh_token) {
      const r = await fetch(`${tl.authBase}/connect/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: tl.clientId,
          client_secret: tl.clientSecret,
          refresh_token: connection.refresh_token,
        }),
      });
      if (r.ok) {
        const t = await r.json();
        accessToken = t.access_token;
        const newExp = new Date();
        newExp.setDate(newExp.getDate() + 90);
        await supabase.from("bank_connections").update({
          access_token: t.access_token,
          refresh_token: t.refresh_token || connection.refresh_token,
          consent_expires_at: newExp.toISOString(),
        }).eq("id", connection.id);
      }
    }

    const { data: bankAccounts } = await supabase
      .from("bank_accounts")
      .select("*")
      .eq("organization_id", connection.organization_id)
      .eq("provider", "TRUELAYER")
      .eq("bank_connection_id", connection.id);

    for (const ba of bankAccounts || []) {
      if (!ba.truelayer_account_id) continue;
      try {
        const fromDate = ba.last_synced_at
          ? new Date(ba.last_synced_at).toISOString().split("T")[0]
          : new Date(Date.now() - 90 * 86_400_000).toISOString().split("T")[0];
        const toDate = new Date().toISOString().split("T")[0];
        const url = `${tl.apiBase}/data/v1/accounts/${ba.truelayer_account_id}/transactions?from=${fromDate}&to=${toDate}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!res.ok) {
          const body = await res.text();
          const mapped = mapTrueLayerError({ message: body, status: res.status });
          failed = true;
          firstErr = firstErr || mapped;
          continue;
        }
        const j = await res.json();
        const txns = j.results || [];
        for (const t of txns) {
          const txData: Record<string, unknown> = {
            organization_id: ba.organization_id,
            bank_account_id: ba.id,
            truelayer_transaction_id: t.transaction_id,
            transaction_date: t.timestamp?.split("T")[0] || new Date().toISOString().split("T")[0],
            description: t.description || "No description",
            amount: t.amount,
            balance: t.running_balance?.amount ?? null,
            currency: t.currency || "GBP",
            category: t.transaction_category || null,
            raw_json: t,
            status: "UNREVIEWED",
            provider: "TRUELAYER",
            import_source: "TRUELAYER_SCHEDULED",
          };
          if (ba.client_id) txData.client_id = ba.client_id;
          else if (ba.company_id) txData.company_id = ba.company_id;

          const { error: upErr } = await supabase
            .from("bank_transactions")
            .upsert(txData, {
              onConflict: "bank_account_id,truelayer_transaction_id",
              ignoreDuplicates: false,
            });
          if (!upErr) imported++;
        }
        await supabase.from("bank_accounts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", ba.id);
      } catch (e) {
        failed = true;
        firstErr = firstErr || mapTrueLayerError(e);
      }
    }

    if (!failed) {
      await supabase.from("bank_connections").update({
        last_synced_at: new Date().toISOString(),
        status: "ACTIVE",
        last_error: null,
      }).eq("id", connection.id);
    } else if (firstErr) {
      await supabase.from("bank_connections").update({
        last_error: `[${firstErr.internal_code}] ${firstErr.client_safe_message}`,
      }).eq("id", connection.id);
    }
  } catch (e) {
    failed = true;
    firstErr = firstErr || mapTrueLayerError(e);
  }

  if (logId) {
    await supabase.from("bank_sync_logs").update({
      status: failed ? (imported + updated > 0 ? "partial" : "failed") : "success",
      completed_at: new Date().toISOString(),
      records_imported: imported,
      records_updated: updated,
      error_code: firstErr?.internal_code || null,
      error_message: failed ? "Scheduled sync hit one or more errors." : null,
      client_safe_message: firstErr?.client_safe_message || null,
    }).eq("id", logId);
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (i: T) => Promise<void>) {
  const queue = [...items];
  const running: Promise<void>[] = [];
  while (queue.length > 0 || running.length > 0) {
    while (running.length < limit && queue.length > 0) {
      const item = queue.shift()!;
      const p = worker(item).catch((e) => console.error("worker error", e))
        .finally(() => {
          const i = running.indexOf(p);
          if (i >= 0) running.splice(i, 1);
        });
      running.push(p);
    }
    if (running.length > 0) await Promise.race(running);
  }
}

serve(async (req) => {
  if (!CRON_SECRET) {
    console.error("CRON_SECRET not set; refusing to run");
    return new Response(JSON.stringify({ error: "not_configured" }), { status: 503 });
  }
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let tl;
  try {
    tl = getTrueLayerConfig();
  } catch (e) {
    if (e instanceof TrueLayerConfigError) {
      return new Response(JSON.stringify({ error: e.clientMessage, code: e.code }), { status: 503 });
    }
    throw e;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: connections, error } = await supabase
    .from("bank_connections")
    .select("*")
    .eq("provider", "TRUELAYER")
    .in("status", ["ACTIVE", "active"])
    .or("consent_expires_at.is.null,consent_expires_at.gt." + new Date().toISOString())
    .limit(BATCH_SIZE);

  if (error) {
    console.error("Failed to list connections:", error);
    return new Response(JSON.stringify({ error: "internal" }), { status: 500 });
  }

  await runWithConcurrency(connections || [], MAX_CONCURRENCY, (c) => syncConnection(supabase, tl, c));

  return new Response(JSON.stringify({ ok: true, processed: connections?.length || 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});