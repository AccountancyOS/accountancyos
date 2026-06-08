import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTrueLayerConfig, TrueLayerConfigError } from "../_shared/truelayer-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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
        console.error('TrueLayer config error:', e.message);
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

    const {
      entity_type,
      entity_id,
      organization_id: providedOrgId,
      redirect_path = '/bookkeeping',
      mode = 'connect',
      bank_connection_id = null,
      surface = 'accountant', // 'accountant' | 'portal'
    } = await req.json();

    if (!entity_type || !entity_id) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: entity_type, entity_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (mode !== 'connect' && mode !== 'reconnect') {
      return new Response(JSON.stringify({ error: "Invalid mode" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Derive organization_id from entity if not provided
    let organization_id = providedOrgId;
    if (!organization_id) {
      const entityTable = entity_type === 'client' ? 'clients' : 'companies';
      const { data: entity, error: entityError } = await supabase
        .from(entityTable)
        .select('organization_id')
        .eq('id', entity_id)
        .single();
      
      if (entityError || !entity) {
        return new Response(JSON.stringify({ error: 'Entity not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      organization_id = entity.organization_id;
    }

    // For reconnect, verify the target connection exists, belongs to the
    // same org + entity, and the requesting user has rights to manage it.
    if (mode === 'reconnect') {
      if (!bank_connection_id) {
        return new Response(JSON.stringify({ error: 'bank_connection_id required for reconnect' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: existing, error: existingErr } = await supabase
        .from('bank_connections')
        .select('id, organization_id, client_id, company_id')
        .eq('id', bank_connection_id)
        .maybeSingle();
      if (existingErr || !existing) {
        return new Response(JSON.stringify({ error: 'Bank connection not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const sameOrg = existing.organization_id === organization_id;
      const sameEntity = entity_type === 'client'
        ? existing.client_id === entity_id
        : existing.company_id === entity_id;
      if (!sameOrg || !sameEntity) {
        console.warn('Reconnect attempt with mismatched org/entity rejected', { user: user.id });
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Generate a secure random state
    const stateArray = new Uint8Array(32);
    crypto.getRandomValues(stateArray);
    const state = Array.from(stateArray, b => b.toString(16).padStart(2, '0')).join('');

    // Store the state in the database for validation on callback
    const stateData: Record<string, unknown> = {
      state,
      organization_id,
      redirect_path,
      mode,
      bank_connection_id,
      return_url: redirect_path,
    };
    if (surface === 'portal') {
      stateData.portal_user_id = user.id;
    } else {
      stateData.accountant_user_id = user.id;
    }
    
    if (entity_type === 'client') {
      stateData.client_id = entity_id;
    } else if (entity_type === 'company') {
      stateData.company_id = entity_id;
    }

    const { error: insertError } = await supabase
      .from('truelayer_auth_states')
      .insert(stateData);

    if (insertError) {
      console.error('Error storing auth state:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to initiate authentication' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build the TrueLayer authorization URL from centralised, env-driven config.
    const scopes = ['info', 'accounts', 'balance', 'transactions', 'offline_access'];
    const authUrl = new URL(`${tlConfig.authBase}/`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', tlConfig.clientId);
    authUrl.searchParams.set('redirect_uri', tlConfig.redirectUri);
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('providers', tlConfig.providers);

    console.log('Generated TrueLayer auth URL', {
      env: tlConfig.env,
      mode,
      user_id: user.id,
      entity_type,
      entity_id,
    });

    return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in truelayer-auth:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
