import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY') || 'default-dev-key-change-in-production';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Simple decryption using Web Crypto API
async function decryptValue(encryptedBase64: string): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  // Decode from base64
  const combined = new Uint8Array(
    atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
  );
  
  // Extract IV and encrypted data
  const iv = combined.slice(0, 12);
  const encryptedData = combined.slice(12);
  
  // Derive key from encryption key
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  
  // Decrypt
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    encryptedData
  );
  
  return decoder.decode(decryptedBuffer);
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { organization_id } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: organization_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to this organization
    const { data: orgUser, error: orgError } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', organization_id)
      .single();

    if (orgError || !orgUser) {
      console.error('Organization access error:', orgError);
      return new Response(
        JSON.stringify({ error: 'Access denied to organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the encrypted API key
    const { data: chData, error: fetchError } = await supabase
      .from('organization_integrations_companies_house')
      .select('api_key_encrypted')
      .eq('organization_id', organization_id)
      .single();

    if (fetchError || !chData?.api_key_encrypted) {
      return new Response(
        JSON.stringify({ success: false, error: 'No API key configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt the API key
    let apiKey: string;
    try {
      apiKey = await decryptValue(chData.api_key_encrypted);
    } catch (decryptError) {
      console.error('Decryption error:', decryptError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to decrypt API key' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Test the connection by calling Companies House API
    // Using the company search endpoint with a test query
    const testUrl = 'https://api.company-information.service.gov.uk/company/00000000';
    
    const response = await fetch(testUrl, {
      headers: {
        'Authorization': `Basic ${btoa(apiKey + ':')}`,
      },
    });

    const now = new Date().toISOString();
    let success = false;
    let errorMessage = null;

    // 404 is expected for a non-existent company - it means auth worked
    // 401 means bad API key
    if (response.status === 404 || response.status === 200) {
      success = true;
    } else if (response.status === 401) {
      errorMessage = 'Invalid API key';
    } else {
      errorMessage = `Unexpected response: ${response.status}`;
    }

    // Update the test results
    const updateData: Record<string, unknown> = {
      last_test_at: now,
      last_test_success: success,
      updated_at: now,
    };

    // Set connected_at on first successful connection
    if (success) {
      const { data: currentData } = await supabase
        .from('organization_integrations_companies_house')
        .select('connected_at')
        .eq('organization_id', organization_id)
        .single();

      if (!currentData?.connected_at) {
        updateData.connected_at = now;
      }
    }

    await supabase
      .from('organization_integrations_companies_house')
      .update(updateData)
      .eq('organization_id', organization_id);

    console.log('CH API key test completed for organization:', organization_id, 'success:', success);

    return new Response(
      JSON.stringify({ success, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in integrations-test-ch-key:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
