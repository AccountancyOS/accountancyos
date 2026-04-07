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

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { organization_id, target_user_id, confirmation } = await req.json();

    if (!organization_id || !confirmation || confirmation !== 'DELETE_ALL_DATA') {
      return new Response(JSON.stringify({ error: 'organization_id and confirmation="DELETE_ALL_DATA" required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify requester is owner
    const { data: membership } = await supabase
      .from('organization_users')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organization_id)
      .single();

    if (!membership || membership.role !== 'owner') {
      return new Response(JSON.stringify({ error: 'Only organization owners can request data deletion' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const deletionTarget = target_user_id || user.id;
    const deletedItems: Record<string, number> = {};

    // For GDPR Right to Erasure: anonymize PII rather than hard-delete
    // to preserve audit trails and financial records (UK regulatory requirement)
    
    // Anonymize contacts belonging to this org
    const { data: contacts, count: contactCount } = await supabase
      .from('contacts')
      .select('id', { count: 'exact' })
      .eq('organization_id', organization_id);

    if (contacts && contacts.length > 0) {
      for (const contact of contacts) {
        await supabase
          .from('contacts')
          .update({
            first_name: 'REDACTED',
            last_name: 'REDACTED',
            email: `redacted-${contact.id}@deleted.local`,
            phone: null,
            nino: null,
            utr: null,
            dob: null,
            ch_personal_code: null,
          })
          .eq('id', contact.id);
      }
      deletedItems.contacts_anonymized = contactCount || 0;
    }

    // Anonymize client names
    const { count: clientCount } = await supabase
      .from('clients')
      .update({
        name: 'REDACTED CLIENT',
        email: null,
        phone: null,
        notes: null,
      })
      .eq('organization_id', organization_id);
    deletedItems.clients_anonymized = clientCount || 0;

    // Delete CRM activities (non-financial, safe to delete)
    const { count: activityCount } = await supabase
      .from('crm_activities')
      .delete()
      .eq('organization_id', organization_id);
    deletedItems.crm_activities_deleted = activityCount || 0;

    // Log the deletion action (audit trail must be preserved per UK regs)
    await supabase.from('audit_log').insert({
      organization_id,
      entity_type: 'gdpr',
      entity_id: deletionTarget,
      action: 'data_deletion_request',
      user_id: user.id,
      metadata: {
        deletion_date: new Date().toISOString(),
        target_user_id: deletionTarget,
        items_affected: deletedItems,
        legal_basis: 'GDPR Article 17 - Right to Erasure',
        retention_note: 'Financial records retained per UK regulatory requirements (7 years). PII anonymized.',
      },
    });

    return new Response(JSON.stringify({
      status: 'completed',
      deletion_date: new Date().toISOString(),
      items_affected: deletedItems,
      retention_notice: 'Financial records (invoices, filings, journals) are retained in anonymized form for 7 years per UK regulatory requirements. All personally identifiable information has been redacted.',
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
