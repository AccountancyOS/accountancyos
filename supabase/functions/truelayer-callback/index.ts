import { serve } from "@std/http";
import { createClient } from "@supabase/supabase-js";

const TRUELAYER_AUTH_URL = 'https://auth.truelayer-sandbox.com';
const TRUELAYER_API_URL = 'https://api.truelayer-sandbox.com';
const TRUELAYER_CLIENT_ID = Deno.env.get('TRUELAYER_CLIENT_ID');
const TRUELAYER_CLIENT_SECRET = Deno.env.get('TRUELAYER_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Get the app URL for redirects (use SUPABASE_URL to derive it or use a default)
const APP_URL = Deno.env.get('APP_URL') || 'https://lovable.dev';

serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  console.log('TrueLayer callback received. Code:', !!code, 'State:', !!state, 'Error:', error);

  // Handle errors from TrueLayer
  if (error) {
    console.error('TrueLayer auth error:', error);
    return Response.redirect(`${APP_URL}/bookkeeping?connection=error&message=${encodeURIComponent(error)}`, 302);
  }

  if (!code || !state) {
    console.error('Missing code or state parameter');
    return Response.redirect(`${APP_URL}/bookkeeping?connection=error&message=missing_parameters`, 302);
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  try {
    // Validate the state parameter
    const { data: authState, error: stateError } = await supabase
      .from('truelayer_auth_states')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (stateError || !authState) {
      console.error('Invalid or expired state:', stateError);
      return Response.redirect(`${APP_URL}/bookkeeping?connection=error&message=invalid_state`, 302);
    }

    console.log('Valid auth state found for org:', authState.organization_id);

    // Exchange the code for tokens
    const redirectUri = `${SUPABASE_URL}/functions/v1/truelayer-callback`;
    const tokenResponse = await fetch(`${TRUELAYER_AUTH_URL}/connect/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: TRUELAYER_CLIENT_ID!,
        client_secret: TRUELAYER_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        code: code,
      }),
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      console.error('Token exchange failed:', tokenError);
      return Response.redirect(`${APP_URL}/bookkeeping?connection=error&message=token_exchange_failed`, 302);
    }

    const tokens = await tokenResponse.json();
    console.log('Token exchange successful, access_token received');
    
    // Extract scope from token response
    const tokenScope = tokens.scope || 'info accounts balance transactions offline_access';

    // Fetch the connected accounts from TrueLayer
    const accountsResponse = await fetch(`${TRUELAYER_API_URL}/data/v1/accounts`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    if (!accountsResponse.ok) {
      const accountsError = await accountsResponse.text();
      console.error('Failed to fetch accounts:', accountsError);
      return Response.redirect(`${APP_URL}/bookkeeping?connection=error&message=accounts_fetch_failed`, 302);
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

    // Create the bank connection record with scope and last_synced_at
    const connectionData: Record<string, unknown> = {
      organization_id: authState.organization_id,
      provider: 'TRUELAYER',
      provider_connection_id: tokens.access_token.substring(0, 32), // Use part of token as ID
      status: 'ACTIVE',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokenScope,
      consent_expires_at: consentExpiresAt.toISOString(),
      bank_name: providerName,
      bank_logo_url: providerLogo,
      last_synced_at: new Date().toISOString(),
    };

    if (authState.client_id) {
      connectionData.client_id = authState.client_id;
    } else if (authState.company_id) {
      connectionData.company_id = authState.company_id;
    }

    const { data: connection, error: connectionError } = await supabase
      .from('bank_connections')
      .insert(connectionData)
      .select()
      .single();

    if (connectionError) {
      console.error('Failed to create bank connection:', connectionError);
      return Response.redirect(`${APP_URL}/bookkeeping?connection=error&message=connection_save_failed`, 302);
    }

    console.log('Bank connection created:', connection.id);

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

        // Create the bank account record with account_number and sort_code
        const bankAccountData: Record<string, unknown> = {
          organization_id: authState.organization_id,
          account_id: bookkeepingAccountId,
          name: account.display_name || `${providerName} Account`,
          account_number: account.account_number?.number || null,
          sort_code: account.account_number?.sort_code || null,
          currency: account.currency || 'GBP',
          provider: 'TRUELAYER',
          truelayer_account_id: account.account_id,
          is_active: true,
        };

        if (authState.client_id) {
          bankAccountData.client_id = authState.client_id;
        } else if (authState.company_id) {
          bankAccountData.company_id = authState.company_id;
        }

        const { error: bankAccountError } = await supabase
          .from('bank_accounts')
          .insert(bankAccountData);

        if (bankAccountError) {
          console.error('Failed to create bank account:', bankAccountError);
        } else {
          console.log('Bank account created for:', account.account_id);
        }
      } catch (accountError) {
        console.error('Error processing account:', account.account_id, accountError);
      }
    }

    // Clean up the auth state
    await supabase
      .from('truelayer_auth_states')
      .delete()
      .eq('state', state);

    // Build redirect URL with entity info for the UI
    const entityParam = authState.client_id 
      ? `client-${authState.client_id}` 
      : `company-${authState.company_id}`;
    
    const redirectPath = authState.redirect_path || '/bookkeeping';
    
    console.log('Redirecting to app with success');
    return Response.redirect(`${APP_URL}${redirectPath}?connection=success&entity=${entityParam}`, 302);
  } catch (error) {
    console.error('Error in truelayer-callback:', error);
    return Response.redirect(`${APP_URL}/bookkeeping?connection=error&message=internal_error`, 302);
  }
});
