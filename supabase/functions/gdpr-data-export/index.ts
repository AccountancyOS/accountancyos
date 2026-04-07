import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user from JWT
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { organization_id } = await req.json();
    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is owner of the organization
    const { data: membership } = await supabase
      .from('organization_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organization_id)
      .single();

    if (!membership || membership.role !== 'owner') {
      return new Response(JSON.stringify({ error: 'Only organization owners can export data' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Collect all user-related data for GDPR export
    const exportData: Record<string, unknown> = {};

    // User profile
    exportData.user = {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    };

    // Organization data
    const { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organization_id)
      .single();
    exportData.organization = org;

    // Clients
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('organization_id', organization_id);
    exportData.clients = clients;

    // Companies
    const { data: companies } = await supabase
      .from('companies')
      .select('*')
      .eq('organization_id', organization_id);
    exportData.companies = companies;

    // Contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organization_id);
    exportData.contacts = contacts;

    // Jobs
    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('organization_id', organization_id);
    exportData.jobs = jobs;

    // Filings
    const { data: filings } = await supabase
      .from('filings')
      .select('*')
      .eq('organization_id', organization_id);
    exportData.filings = filings;

    // Invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('organization_id', organization_id);
    exportData.invoices = invoices;

    // Audit log
    const { data: auditLog } = await supabase
      .from('audit_log')
      .select('*')
      .eq('organization_id', organization_id)
      .order('created_at', { ascending: false })
      .limit(5000);
    exportData.audit_log = auditLog;

    // Log this export in audit
    await supabase.from('audit_log').insert({
      organization_id,
      entity_type: 'gdpr',
      entity_id: user.id,
      action: 'data_export',
      user_id: user.id,
      metadata: { exported_at: new Date().toISOString() },
    });

    return new Response(JSON.stringify({
      export_format: 'GDPR_UK_DATA_EXPORT',
      export_date: new Date().toISOString(),
      data_controller: org?.name || 'Unknown',
      data_subject: user.email,
      data: exportData,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
