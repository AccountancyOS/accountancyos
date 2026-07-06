import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTrueLayerConfig, TrueLayerConfigError } from "../_shared/truelayer-config.ts";
import { mapTrueLayerError } from "../_shared/truelayer-errors.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

async function refreshTokenIfNeeded(supabase: any, connection: any, tl: { authBase: string; clientId: string; clientSecret: string }): Promise<string | null> {
  // Check if token needs refresh (if consent is expiring soon or we get a 401)
  const expiresAt = new Date(connection.consent_expires_at);
  const now = new Date();
  const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  // If expiring within 7 days and we have a refresh token, try to refresh
  if (daysUntilExpiry < 7 && connection.refresh_token) {
    console.log('Token expiring soon, attempting refresh');
    
    try {
      const refreshResponse = await fetch(`${tl.authBase}/connect/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: tl.clientId,
          client_secret: tl.clientSecret,
          refresh_token: connection.refresh_token,
        }),
      });

      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json();
        
        // Update the connection with new tokens
        const newExpiresAt = new Date();
        newExpiresAt.setDate(newExpiresAt.getDate() + 90);
        
        await supabase
          .from('bank_connections')
          .update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || connection.refresh_token,
            consent_expires_at: newExpiresAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        console.log('Token refreshed successfully');
        return tokens.access_token;
      } else {
        console.error('Token refresh failed:', (await refreshResponse.text()).slice(0, 200));
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
    }
  }

  return connection.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let tlConfig;
    try {
      tlConfig = getTrueLayerConfig();
    } catch (e) {
      if (e instanceof TrueLayerConfigError) {
        return new Response(JSON.stringify({ error: e.clientMessage, code: e.code }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw e;
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { bank_account_id, connection_id, triggered_by = 'manual' } = await req.json();

    if (!bank_account_id && !connection_id) {
      return new Response(JSON.stringify({ error: 'Either bank_account_id or connection_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let bankAccount;
    let connection;

    if (bank_account_id) {
      // Get the bank account
      const { data: ba, error: baError } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('id', bank_account_id)
        .single();

      if (baError || !ba) {
        return new Response(JSON.stringify({ error: 'Bank account not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      bankAccount = ba;

      if (bankAccount.provider !== 'TRUELAYER') {
        return new Response(JSON.stringify({ error: 'Bank account is not connected via TrueLayer' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get the connection for this entity
      const connectionQuery = supabase
        .from('bank_connections')
        .select('*')
        .eq('organization_id', bankAccount.organization_id)
        .eq('status', 'ACTIVE');

      if (bankAccount.client_id) {
        connectionQuery.eq('client_id', bankAccount.client_id);
      } else if (bankAccount.company_id) {
        connectionQuery.eq('company_id', bankAccount.company_id);
      }

      const { data: conn, error: connError } = await connectionQuery.single();

      if (connError || !conn) {
        return new Response(JSON.stringify({ error: 'No active bank connection found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      connection = conn;
    } else {
      // Get connection directly
      const { data: conn, error: connError } = await supabase
        .from('bank_connections')
        .select('*')
        .eq('id', connection_id)
        .single();

      if (connError || !conn) {
        return new Response(JSON.stringify({ error: 'Connection not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      connection = conn;
    }

    // SEC-4/Fix 3: authorize the caller against the resolved connection. The
    // bank_account_id/connection_id come from the request body, so without this any
    // authenticated user could force a TrueLayer pull into any tenant (IDOR). Allow an org
    // member (accountant surface) OR a portal user with access to the entity (client surface);
    // the scheduled sync runs in a separate service-role function, not through here.
    const [{ data: inOrg }, { data: portalAccess }] = await Promise.all([
      supabase.rpc('user_in_organization', {
        check_user_id: user.id, check_org_id: connection.organization_id,
      }),
      supabase.rpc('portal_user_has_entity_access', {
        _user_id: user.id, _client_id: connection.client_id, _company_id: connection.company_id,
      }),
    ]);
    if (inOrg !== true && portalAccess !== true) {
      console.warn('truelayer-sync: caller not authorized', { user: user.id, org: connection.organization_id });
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refresh token if needed
    const accessToken = await refreshTokenIfNeeded(supabase, connection, tlConfig);
    if (!accessToken) {
      // Mark connection as error
      await supabase
        .from('bank_connections')
        .update({
          status: 'error',
          last_error: 'Failed to get valid access token',
        })
        .eq('id', connection.id);
      
      return new Response(JSON.stringify({ error: 'Failed to get valid access token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Open a sync log row up front; updated on completion.
    const { data: syncLog } = await supabase
      .from('bank_sync_logs')
      .insert({
        organization_id: connection.organization_id,
        bank_connection_id: connection.id,
        client_id: connection.client_id || null,
        company_id: connection.company_id || null,
        triggered_by,
        triggered_by_user_id: user.id,
        status: 'running',
      })
      .select('id')
      .single();

    // Get all bank accounts for this connection
    const bankAccountsQuery = supabase
      .from('bank_accounts')
      .select('*')
      .eq('organization_id', connection.organization_id)
      .eq('provider', 'TRUELAYER');

    if (connection.client_id) {
      bankAccountsQuery.eq('client_id', connection.client_id);
    } else if (connection.company_id) {
      bankAccountsQuery.eq('company_id', connection.company_id);
    }

    const { data: bankAccounts, error: bankAccountsError } = await bankAccountsQuery;

    if (bankAccountsError) {
      console.error('Error fetching bank accounts:', bankAccountsError);
      if (syncLog?.id) {
        await supabase.from('bank_sync_logs').update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_code: 'sync_failed',
          error_message: bankAccountsError.message,
          client_safe_message: 'Sync failed - contact your accountant.',
        }).eq('id', syncLog.id);
      }
      return new Response(JSON.stringify({ error: 'Failed to fetch bank accounts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalNewTransactions = 0;
    let totalUpdatedTransactions = 0;
    let anyAccountFailed = false;
    let firstMappedError: ReturnType<typeof mapTrueLayerError> | null = null;

    // Sync transactions for each bank account
    for (const ba of bankAccounts || []) {
      if (!ba.truelayer_account_id) continue;

      try {
        // Fetch transactions from TrueLayer
        const fromDate = ba.last_synced_at 
          ? new Date(ba.last_synced_at).toISOString().split('T')[0]
          : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 90 days ago
        const toDate = new Date().toISOString().split('T')[0];

        const transactionsUrl = `${tlConfig.apiBase}/data/v1/accounts/${ba.truelayer_account_id}/transactions?from=${fromDate}&to=${toDate}`;
        
        const transactionsResponse = await fetch(transactionsUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!transactionsResponse.ok) {
          const errorText = await transactionsResponse.text();
          const mapped = mapTrueLayerError({ message: errorText, status: transactionsResponse.status });
          anyAccountFailed = true;
          firstMappedError = firstMappedError || mapped;
          console.error('Failed to fetch transactions for account:', ba.truelayer_account_id, mapped.internal_code);
          await supabase
            .from('bank_connections')
            .update({
              status: mapped.internal_code === 'action_required' || mapped.internal_code === 'expired' ? 'error' : connection.status,
              last_error: `[${mapped.internal_code}] failed to fetch transactions`,
            })
            .eq('id', connection.id);
          continue;
        }

        const transactionsData = await transactionsResponse.json();
        const transactions = transactionsData.results || [];

        console.log(`Fetched ${transactions.length} transactions for account ${ba.truelayer_account_id}`);

        // Atomic upsert keyed on (bank_account_id, truelayer_transaction_id).
        // Falls back to a deterministic import_hash when the provider does not
        // supply a stable transaction_id. Both paths are covered by unique
        // partial indexes so concurrent syncs cannot duplicate rows.
        const batchId = crypto.randomUUID();
        const withProviderId: Record<string, unknown>[] = [];
        const withFallbackHash: Record<string, unknown>[] = [];

        const buildBase = (txn: any): Record<string, unknown> => {
          const base: Record<string, unknown> = {
            organization_id: ba.organization_id,
            bank_account_id: ba.id,
            transaction_date: txn.timestamp?.split('T')[0] || new Date().toISOString().split('T')[0],
            description: txn.description || 'No description',
            amount: txn.amount,
            balance: txn.running_balance?.amount || null,
            currency: txn.currency || 'GBP',
            category: txn.transaction_category || null,
            raw_json: txn,
            status: 'UNREVIEWED',
            provider: 'TRUELAYER',
            import_source: 'TRUELAYER',
            import_batch_id: batchId,
          };
          if (ba.client_id) base.client_id = ba.client_id;
          else if (ba.company_id) base.company_id = ba.company_id;
          return base;
        };

        const buildFallbackHash = (txn: any): string => {
          const parts = [
            ba.id,
            txn.timestamp?.split('T')[0] || '',
            Number(txn.amount ?? 0).toFixed(2),
            (txn.description || '').trim().toLowerCase().replace(/\s+/g, ' '),
            (txn.merchant_name || txn.counter_party || '').toString().trim().toLowerCase(),
          ].join('|');
          return `tl:${parts}`;
        };

        for (const txn of transactions) {
          const base = buildBase(txn);
          if (txn.transaction_id) {
            base.truelayer_transaction_id = txn.transaction_id;
            withProviderId.push(base);
          } else {
            base.import_hash = buildFallbackHash(txn);
            withFallbackHash.push(base);
          }
        }

        if (withProviderId.length > 0) {
          const { data: upserted, error: upErr } = await supabase
            .from('bank_transactions')
            .upsert(withProviderId, {
              onConflict: 'bank_account_id,truelayer_transaction_id',
              ignoreDuplicates: false,
            })
            .select('id, created_at, updated_at');
          if (upErr) {
            throw upErr;
          }
          for (const row of upserted || []) {
            // created_at == updated_at within ~1s => fresh insert
            const created = new Date(row.created_at as string).getTime();
            const updated = new Date((row.updated_at as string) || row.created_at as string).getTime();
            if (Math.abs(updated - created) < 1500) totalNewTransactions++;
            else totalUpdatedTransactions++;
          }
        }

        if (withFallbackHash.length > 0) {
          const { data: inserted, error: hashErr } = await supabase
            .from('bank_transactions')
            .upsert(withFallbackHash, {
              onConflict: 'bank_account_id,import_hash',
              ignoreDuplicates: true,
            })
            .select('id');
          if (hashErr) {
            throw hashErr;
          }
          totalNewTransactions += inserted?.length ?? 0;
        }

        // Update last_synced_at on the bank account
        await supabase
          .from('bank_accounts')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', ba.id);

      } catch (accountError) {
        const mapped = mapTrueLayerError(accountError);
        anyAccountFailed = true;
        firstMappedError = firstMappedError || mapped;
        console.error('Error syncing account:', ba.id, mapped.internal_code);
        await supabase
          .from('bank_connections')
          .update({
            status: 'error',
            last_error: `[${mapped.internal_code}] ${mapped.client_safe_message}`,
          })
          .eq('id', connection.id);
      }
    }

    // Only clear error state if every account succeeded.
    if (!anyAccountFailed) {
      await supabase
        .from('bank_connections')
        .update({
          last_synced_at: new Date().toISOString(),
          status: 'ACTIVE',
          last_error: null,
        })
        .eq('id', connection.id);
    }

    if (syncLog?.id) {
      await supabase.from('bank_sync_logs').update({
        status: anyAccountFailed
          ? (totalNewTransactions + totalUpdatedTransactions > 0 ? 'partial' : 'failed')
          : 'success',
        completed_at: new Date().toISOString(),
        records_imported: totalNewTransactions,
        records_updated: totalUpdatedTransactions,
        error_code: firstMappedError?.internal_code || null,
        error_message: anyAccountFailed ? 'One or more accounts failed to sync.' : null,
        client_safe_message: firstMappedError?.client_safe_message || null,
      }).eq('id', syncLog.id);
    }

    console.log(`Sync complete: ${totalNewTransactions} new, ${totalUpdatedTransactions} updated`);

    return new Response(JSON.stringify({
      success: true,
      new_transactions: totalNewTransactions,
      updated_transactions: totalUpdatedTransactions,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in truelayer-sync:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
