import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HMRC_ENDPOINTS = {
  sandbox: 'https://test-api.service.hmrc.gov.uk',
  production: 'https://api.service.hmrc.gov.uk',
};

const HMRC_CLIENT_ID = Deno.env.get('HMRC_CLIENT_ID');
const HMRC_CLIENT_SECRET = Deno.env.get('HMRC_CLIENT_SECRET');
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') || 'default-dev-key-change-in-production';

// Decrypt token using AES-GCM
async function decryptValue(encrypted: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    data
  );
  
  return decoder.decode(decryptedBuffer);
}

// Encrypt token using AES-GCM
async function encryptValue(plaintext: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    data
  );
  
  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

// Refresh HMRC access token
async function refreshAccessToken(
  refreshToken: string,
  environment: 'sandbox' | 'production'
): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
  try {
    const response = await fetch(`${HMRC_ENDPOINTS[environment]}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: HMRC_CLIENT_ID!,
        client_secret: HMRC_CLIENT_SECRET!,
      }),
    });

    if (!response.ok) {
      console.error('HMRC token refresh failed:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const { companyId, clientId, vrn, fromDate, toDate, forceRefresh = false } = await req.json();

    if (!vrn) {
      return new Response(
        JSON.stringify({ success: false, message: 'VAT Registration Number (vrn) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's organization
    const { data: orgUser, error: orgError } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (orgError || !orgUser) {
      return new Response(
        JSON.stringify({ success: false, message: 'User not in organization' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const organizationId = orgUser.organization_id;

    // Check cache first (if not forcing refresh)
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('vat_obligations')
        .select('*')
        .eq('vrn', vrn)
        .gte('fetched_at', new Date(Date.now() - 3600000).toISOString()) // 1 hour cache
        .order('period_end', { ascending: false });

      if (cached && cached.length > 0) {
        console.log('Returning cached obligations');
        return new Response(
          JSON.stringify({
            success: true,
            cached: true,
            obligations: cached.map(o => ({
              periodKey: o.period_key,
              start: o.period_start,
              end: o.period_end,
              due: o.due_date,
              status: o.status,
              received: o.received_date,
            })),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get HMRC integration
    const { data: hmrcAuth, error: hmrcAuthError } = await supabase
      .from('organization_integrations_hmrc')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (hmrcAuthError || !hmrcAuth?.mtd_vat_connected) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'HMRC MTD VAT not connected. Please connect via Settings.',
          error_code: 'HMRC_NOT_CONNECTED'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const environment = hmrcAuth.test_mode ? 'sandbox' : 'production';

    // Decrypt and potentially refresh token
    let accessToken: string;
    try {
      accessToken = await decryptValue(hmrcAuth.mtd_vat_access_token_encrypted);
    } catch (e) {
      console.error('Failed to decrypt access token:', e);
      return new Response(
        JSON.stringify({ success: false, message: 'Failed to decrypt HMRC credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is expired and refresh
    const expiresAt = new Date(hmrcAuth.mtd_vat_expires_at);
    if (expiresAt < new Date(Date.now() + 300000)) { // 5 min buffer
      console.log('HMRC token expired or expiring soon, refreshing...');
      
      let refreshToken: string;
      try {
        refreshToken = await decryptValue(hmrcAuth.mtd_vat_refresh_token_encrypted);
      } catch (e) {
        return new Response(
          JSON.stringify({ success: false, message: 'Failed to decrypt refresh token' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const newTokens = await refreshAccessToken(refreshToken, environment);
      if (!newTokens) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            message: 'HMRC token refresh failed. Please reconnect HMRC.',
            error_code: 'TOKEN_REFRESH_FAILED'
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update stored tokens
      const encryptedAccess = await encryptValue(newTokens.access_token);
      const encryptedRefresh = await encryptValue(newTokens.refresh_token);
      const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

      await supabase
        .from('organization_integrations_hmrc')
        .update({
          mtd_vat_access_token_encrypted: encryptedAccess,
          mtd_vat_refresh_token_encrypted: encryptedRefresh,
          mtd_vat_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId);

      accessToken = newTokens.access_token;
    }

    // Build obligations URL
    const obligationsUrl = new URL(`${HMRC_ENDPOINTS[environment]}/organisations/vat/${vrn}/obligations`);
    if (fromDate) obligationsUrl.searchParams.set('from', fromDate);
    if (toDate) obligationsUrl.searchParams.set('to', toDate);
    // Default to last 2 years if no dates provided
    if (!fromDate && !toDate) {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      obligationsUrl.searchParams.set('from', twoYearsAgo.toISOString().split('T')[0]);
      obligationsUrl.searchParams.set('to', new Date().toISOString().split('T')[0]);
    }

    // Fetch obligations from HMRC
    console.log(`Fetching VAT obligations from HMRC (${environment}):`, obligationsUrl.toString());
    const correlationId = `OBL-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    const hmrcResponse = await fetch(obligationsUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.hmrc.1.0+json',
        'Gov-Client-Connection-Method': 'WEB_APP_VIA_SERVER',
      },
    });

    const responseBody = await hmrcResponse.json();
    const durationMs = Date.now() - startTime;

    // Log provider event
    await supabase
      .from('filing_provider_events')
      .insert({
        organization_id: organizationId,
        provider: 'HMRC',
        event_type: 'obligations_fetch',
        endpoint: obligationsUrl.pathname,
        environment,
        correlation_id: correlationId,
        request_summary: { vrn: vrn.slice(0, 3) + '***', fromDate, toDate },
        response_status: hmrcResponse.status,
        response_summary: { 
          count: responseBody?.obligations?.length || 0,
          error: responseBody?.code,
        },
        duration_ms: durationMs,
      });

    if (!hmrcResponse.ok) {
      console.error('HMRC obligations fetch failed:', responseBody);
      return new Response(
        JSON.stringify({
          success: false,
          message: responseBody?.message || 'Failed to fetch VAT obligations',
          error_code: responseBody?.code || 'HMRC_ERROR',
          errors: responseBody?.errors || [],
        }),
        { status: hmrcResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const obligations = responseBody.obligations || [];

    // Store/update obligations in cache
    for (const obl of obligations) {
      await supabase
        .from('vat_obligations')
        .upsert({
          organization_id: organizationId,
          company_id: companyId || null,
          client_id: clientId || null,
          vrn,
          period_key: obl.periodKey,
          period_start: obl.start,
          period_end: obl.end,
          due_date: obl.due,
          status: obl.status,
          received_date: obl.received || null,
          fetched_at: new Date().toISOString(),
          raw_response: obl,
        }, {
          onConflict: 'vrn,period_key',
        });
    }

    console.log(`Fetched ${obligations.length} VAT obligations`);

    return new Response(
      JSON.stringify({
        success: true,
        cached: false,
        obligations: obligations.map((o: any) => ({
          periodKey: o.periodKey,
          start: o.start,
          end: o.end,
          due: o.due,
          status: o.status,
          received: o.received,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in hmrc-vat-obligations:', error);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
