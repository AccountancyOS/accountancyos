import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // user-scoped client to verify identity & org membership via RLS
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { template_id, job_id } = body ?? {};
    if (!template_id || !job_id) {
      return new Response(JSON.stringify({ error: 'template_id and job_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Fetch job + template
    const { data: job, error: jobErr } = await admin
      .from('jobs')
      .select('id, organization_id, client_id, company_id, service_type, job_name')
      .eq('id', job_id)
      .single();
    if (jobErr || !job) {
      return new Response(JSON.stringify({ error: 'Job not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller belongs to org
    const { data: membership } = await admin
      .from('organization_users')
      .select('user_id')
      .eq('organization_id', job.organization_id)
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: tmpl, error: tmplErr } = await admin
      .from('workpaper_templates')
      .select('*')
      .eq('id', template_id)
      .single();
    if (tmplErr || !tmpl) {
      return new Response(JSON.stringify({ error: 'Template not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!tmpl.file_path) {
      return new Response(JSON.stringify({ error: 'Template has no Excel file' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create instance row first to get an id
    const { data: instance, error: insErr } = await admin
      .from('job_workpaper_instances')
      .insert({
        organization_id: job.organization_id,
        job_id: job.id,
        client_id: job.client_id ?? null,
        company_id: job.company_id ?? null,
        template_id: tmpl.id,
        template_version: tmpl.version,
        name: tmpl.name,
        instance_schema_json: {},
        instance_data_json: {},
        status: 'draft',
        created_by: userData.user.id,
        file_name: tmpl.file_name,
        file_size_bytes: tmpl.file_size_bytes,
      })
      .select()
      .single();
    if (insErr || !instance) {
      return new Response(JSON.stringify({ error: insErr?.message ?? 'Insert failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const destPath = `instances/${job.organization_id}/${job.id}/${instance.id}.xlsx`;

    // Copy file in storage
    const { error: copyErr } = await admin.storage
      .from('workpaper-files')
      .copy(tmpl.file_path, destPath);
    if (copyErr) {
      await admin.from('job_workpaper_instances').delete().eq('id', instance.id);
      return new Response(JSON.stringify({ error: `Copy failed: ${copyErr.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: updated, error: updErr } = await admin
      .from('job_workpaper_instances')
      .update({
        file_path: destPath,
        last_uploaded_at: new Date().toISOString(),
        last_uploaded_by: userData.user.id,
      })
      .eq('id', instance.id)
      .select()
      .single();
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ instance: updated }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});