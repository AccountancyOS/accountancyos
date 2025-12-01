import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TRUELAYER_API_URL = 'https://api.truelayer-sandbox.com';
const TRUELAYER_AUTH_URL = 'https://auth.truelayer-sandbox.com';
const TRUELAYER_CLIENT_ID = Deno.env.get('TRUELAYER_CLIENT_ID');
const TRUELAYER_CLIENT_SECRET = Deno.env.get('TRUELAYER_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

async function refreshTokenIfNeeded(supabase: any, connection: any): Promise<string | null> {
  // Check if token needs refresh (if consent is expiring soon or we get a 401)
  const expiresAt = new Date(connection.consent_expires_at);
  const now = new Date();
  const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  // If expiring within 7 days and we have a refresh token, try to refresh
  if (daysUntilExpiry < 7 && connection.refresh_token) {
    console.log('Token expiring soon, attempting refresh');
    
    try {
      const refreshResponse = await fetch(`${TRUELAYER_AUTH_URL}/connect/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: TRUELAYER_CLIENT_ID!,
          client_secret: TRUELAYER_CLIENT_SECRET!,
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
        console.error('Token refresh failed:', await refreshResponse.text());
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

    const { bank_account_id, connection_id } = await req.json();

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

    // Refresh token if needed
    const accessToken = await refreshTokenIfNeeded(supabase, connection);
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
      return new Response(JSON.stringify({ error: 'Failed to fetch bank accounts' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalNewTransactions = 0;
    let totalUpdatedTransactions = 0;

    // Sync transactions for each bank account
    for (const ba of bankAccounts || []) {
      if (!ba.truelayer_account_id) continue;

      try {
        // Fetch transactions from TrueLayer
        const fromDate = ba.last_synced_at 
          ? new Date(ba.last_synced_at).toISOString().split('T')[0]
          : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 90 days ago
        const toDate = new Date().toISOString().split('T')[0];

        const transactionsUrl = `${TRUELAYER_API_URL}/data/v1/accounts/${ba.truelayer_account_id}/transactions?from=${fromDate}&to=${toDate}`;
        
        const transactionsResponse = await fetch(transactionsUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!transactionsResponse.ok) {
          const errorText = await transactionsResponse.text();
          console.error('Failed to fetch transactions for account:', ba.truelayer_account_id, errorText);
          
          // Update connection with error status
          await supabase
            .from('bank_connections')
            .update({
              status: 'error',
              last_error: `Failed to fetch transactions: ${errorText}`,
            })
            .eq('id', connection.id);
          
          continue;
        }

        const transactionsData = await transactionsResponse.json();
        const transactions = transactionsData.results || [];

        console.log(`Fetched ${transactions.length} transactions for account ${ba.truelayer_account_id}`);

        // Upsert transactions with category and raw_json
        for (const txn of transactions) {
          const transactionData: Record<string, unknown> = {
            organization_id: ba.organization_id,
            bank_account_id: ba.id,
            truelayer_transaction_id: txn.transaction_id,
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
          };

          if (ba.client_id) {
            transactionData.client_id = ba.client_id;
          } else if (ba.company_id) {
            transactionData.company_id = ba.company_id;
          }

          // Check if transaction already exists
          const { data: existing } = await supabase
            .from('bank_transactions')
            .select('id')
            .eq('truelayer_transaction_id', txn.transaction_id)
            .maybeSingle();

          if (existing) {
            // Update existing transaction
            await supabase
              .from('bank_transactions')
              .update({
                balance: transactionData.balance,
                currency: transactionData.currency,
                category: transactionData.category,
                raw_json: transactionData.raw_json,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);
            totalUpdatedTransactions++;
          } else {
            // Insert new transaction
            await supabase
              .from('bank_transactions')
              .insert(transactionData);
            totalNewTransactions++;
          }
        }

        // Update last_synced_at on the bank account
        await supabase
          .from('bank_accounts')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', ba.id);

      } catch (accountError) {
        console.error('Error syncing account:', ba.id, accountError);
        
        // Update connection with error
        await supabase
          .from('bank_connections')
          .update({
            status: 'error',
            last_error: accountError instanceof Error ? accountError.message : 'Unknown sync error',
          })
          .eq('id', connection.id);
      }
    }

    // Update connection last_synced_at and clear any error status on success
    await supabase
      .from('bank_connections')
      .update({
        last_synced_at: new Date().toISOString(),
        status: 'active',
        last_error: null,
      })
      .eq('id', connection.id);

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
