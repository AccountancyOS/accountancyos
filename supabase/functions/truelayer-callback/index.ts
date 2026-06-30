import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getTrueLayerConfig,
  getBaseUrlForReturnPath,
  safeReturnPath,
  TrueLayerConfigError,
} from "../_shared/truelayer-config.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const SAFE_REASON_RE = /^[a-z0-9_]{1,64}$/i;
function sanitizeReason(reason: string): string {
  return SAFE_REASON_RE.test(reason) ? reason : 'internal_error';
}

// Build a safe redirect URL using URL() — never raw concatenation. The
// returnPath is run through safeReturnPath() before being passed in.
function buildRedirect(returnPath: string, params: Record<string, string>) {
  const safePath = safeReturnPath(returnPath);
  const baseUrl = getBaseUrlForReturnPath(safePath);
  const url = new URL(safePath, baseUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return Response.redirect(url.toString(), 302);
}

function safeRedirect(_appUrl: string, basePath: string, reason: string) {
  return buildRedirect(basePath, {
    connection: 'failed',
    reason: sanitizeReason(reason),
  });
}

serve(async (req) => {
  const APP_URL = ''; // legacy arg, ignored by safeRedirect
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  console.log('TrueLayer callback received. Code:', !!code, 'State:', !!state, 'Error:', error);

  let tlConfig;
  try {
    tlConfig = getTrueLayerConfig();
  } catch (e) {
    const code = e instanceof TrueLayerConfigError ? 'not_configured' : 'internal_error';
    return safeRedirect(APP_URL, '/bookkeeping?tab=banking', code);
  }

  // Handle errors from TrueLayer
  if (error) {
    console.error('TrueLayer auth error:', error);
    return safeRedirect(APP_URL, '/bookkeeping?tab=banking', 'provider_error');
  }

  if (!code || !state) {
    console.error('Missing code or state parameter');
    return safeRedirect(APP_URL, '/bookkeeping?tab=banking', 'missing_parameters');
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    // Validate the state parameter (single-use)
    const { data: authState, error: stateError } = await supabase
      .from('truelayer_auth_states')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .is('used_at', null)
      .single();

    if (stateError || !authState) {
      console.error('Invalid or expired state:', stateError);
      return safeRedirect(APP_URL, '/bookkeeping?tab=banking', 'invalid_state');
    }

    const returnPath = authState.return_url || authState.redirect_path || '/bookkeeping?tab=banking';
    const isReconnect = authState.mode === 'reconnect';

    // Mark state as used immediately to prevent replay.
    await supabase
      .from('truelayer_auth_states')
      .update({ used_at: new Date().toISOString() })
      .eq('state', state);

    console.log('Valid auth state found for org:', authState.organization_id);

    // Exchange the code for tokens
    const tokenResponse = await fetch(`${tlConfig.authBase}/connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: tlConfig.clientId,
        client_secret: tlConfig.clientSecret,
        redirect_uri: tlConfig.redirectUri,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      console.error('Token exchange failed:', tokenError.slice(0, 200));
      return safeRedirect(APP_URL, returnPath, 'token_exchange_failed');
    }

    const tokens = await tokenResponse.json();
    console.log('Token exchange successful, access_token received');
    
    // Extract scope from token response
    const tokenScope = tokens.scope || 'info accounts balance transactions offline_access';

    // Fetch the connected accounts from TrueLayer
    const accountsResponse = await fetch(`${tlConfig.apiBase}/data/v1/accounts`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    if (!accountsResponse.ok) {
      const accountsError = await accountsResponse.text();
      console.error('Failed to fetch accounts:', accountsError.slice(0, 200));
      return safeRedirect(APP_URL, returnPath, 'accounts_fetch_failed');
    }

    const accountsData = await accountsResponse.json();
    const accounts = accountsData.results || [];
    
    console.log('Fetched', accounts.length, 'accounts from TrueLayer');

    // Calculate consent expiry (typically 90 days)
    const consentExpiresAt = new Date();
    consentExpiresAt.setDate(consentExpiresAt.getDate() + 90);

    // Get provider info from the first account
    const providerName = accounts[0]?.provider?.display_name || 'Unknown Bank';
    const providerLogo = accounts[0]?.provider?.logo_uri || null;

    let connection: { id: string } | null = null;

    if (isReconnect && authState.bank_connection_id) {
      // Reconnect: update tokens + expiry on the existing connection only.
      // Auth-time guard in truelayer-auth already enforced org/entity match,
      // but we re-verify here to be defensive.
      const { data: existing } = await supabase
        .from('bank_connections')
        .select('id, organization_id, client_id, company_id')
        .eq('id', authState.bank_connection_id)
        .maybeSingle();

      const sameOrg = existing && existing.organization_id === authState.organization_id;
      const sameClient = !authState.client_id || existing?.client_id === authState.client_id;
      const sameCompany = !authState.company_id || existing?.company_id === authState.company_id;

      if (!existing || !sameOrg || !sameClient || !sameCompany) {
        console.warn('Reconnect rejected: org/entity mismatch');
        return safeRedirect(APP_URL, returnPath, 'reconnect_rejected');
      }

      const { error: updErr } = await supabase
        .from('bank_connections')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          scope: tokenScope,
          status: 'ACTIVE',
          consent_expires_at: consentExpiresAt.toISOString(),
          bank_name: providerName,
          bank_logo_url: providerLogo,
          last_error: null,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (updErr) {
        console.error('Failed to update bank connection on reconnect:', updErr);
        return safeRedirect(APP_URL, returnPath, 'connection_save_failed');
      }
      connection = { id: existing.id };
    } else {
      // New connection.
      const connectionData: Record<string, unknown> = {
        organization_id: authState.organization_id,
        provider: 'TRUELAYER',
        provider_connection_id: tokens.access_token.substring(0, 32),
        status: 'ACTIVE',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokenScope,
        consent_expires_at: consentExpiresAt.toISOString(),
        bank_name: providerName,
        bank_logo_url: providerLogo,
        last_synced_at: new Date().toISOString(),
      };
      if (authState.client_id) connectionData.client_id = authState.client_id;
      else if (authState.company_id) connectionData.company_id = authState.company_id;

      const { data: inserted, error: connectionError } = await supabase
        .from('bank_connections')
        .insert(connectionData)
        .select('id')
        .single();

      if (connectionError || !inserted) {
        console.error('Failed to create bank connection:', connectionError);
        return safeRedirect(APP_URL, returnPath, 'connection_save_failed');
      }
      connection = inserted;
    }

    // Audit log row for the callback.
    await supabase.from('bank_sync_logs').insert({
      organization_id: authState.organization_id,
      bank_connection_id: connection.id,
      client_id: authState.client_id || null,
      company_id: authState.company_id || null,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: 'success',
      records_imported: accounts.length,
      records_updated: 0,
      triggered_by: isReconnect ? 'reconnect' : 'callback',
      triggered_by_user_id: authState.portal_user_id || authState.accountant_user_id || null,
    });

    // For each account, we need to find or create a bookkeeping account and then create a bank_account
    for (const account of accounts) {
      try {
        // First, find or create a bookkeeping account for this bank account
        const accountCode = `1000-${account.account_id.substring(0, 4)}`;
        const accountName = `${providerName} - ${account.display_name || account.account_id}`;
        
        // Check if bookkeeping account exists
        let bookkeepingAccountId: string;
        
        const { data: existingAccount } = await supabase
          .from('bookkeeping_accounts')
          .select('id')
          .eq('organization_id', authState.organization_id)
          .eq('truelayer_account_id', account.account_id)
          .maybeSingle();

        if (existingAccount) {
          bookkeepingAccountId = existingAccount.id;
        } else {
          // Create a new bookkeeping account
          const bookkeepingAccountData: Record<string, unknown> = {
            organization_id: authState.organization_id,
            code: accountCode,
            name: accountName,
            account_type: 'ASSET',
            account_subtype: 'CURRENT_ASSET',
            is_bank_account: true,
            is_active: true,
            // Persist so the dedup lookup above matches on reconnect (no duplicate GL account).
            truelayer_account_id: account.account_id,
          };
          
          if (authState.client_id) {
            bookkeepingAccountData.client_id = authState.client_id;
          } else if (authState.company_id) {
            bookkeepingAccountData.company_id = authState.company_id;
          }

          const { data: newBookkeepingAccount, error: bookkeepingError } = await supabase
            .from('bookkeeping_accounts')
            .insert(bookkeepingAccountData)
            .select()
            .single();

          if (bookkeepingError) {
            console.error('Failed to create bookkeeping account:', bookkeepingError);
            continue;
          }
          bookkeepingAccountId = newBookkeepingAccount.id;
        }

        // Upsert the bank account, scoped to connection + provider id (dedup).
        const bankAccountData: Record<string, unknown> = {
          organization_id: authState.organization_id,
          bank_connection_id: connection.id,
          account_id: bookkeepingAccountId,
          name: account.display_name || `${providerName} Account`,
          account_number: account.account_number?.number || null,
          sort_code: account.account_number?.sort_code || null,
          currency: account.currency || 'GBP',
          provider: 'TRUELAYER',
          truelayer_account_id: account.account_id,
          is_active: true,
        };
        if (authState.client_id) bankAccountData.client_id = authState.client_id;
        else if (authState.company_id) bankAccountData.company_id = authState.company_id;

        const { error: bankAccountError } = await supabase
          .from('bank_accounts')
          .upsert(bankAccountData, {
            onConflict: 'bank_connection_id,truelayer_account_id',
            ignoreDuplicates: false,
          });
        if (bankAccountError) {
          console.error('Failed to upsert bank account:', bankAccountError);
        }
      } catch (accountError) {
        console.error('Error processing account:', account.account_id, accountError);
      }
    }

    const entityParam = authState.client_id
      ? `client-${authState.client_id}`
      : `company-${authState.company_id}`;
    return buildRedirect(returnPath, {
      connection: 'success',
      entity: entityParam,
    });
  } catch (error) {
    console.error('Error in truelayer-callback:', error);
    return safeRedirect(APP_URL, '/bookkeeping?tab=banking', 'internal_error');
  }
});
