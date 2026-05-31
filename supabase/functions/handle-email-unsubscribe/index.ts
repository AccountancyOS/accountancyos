import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function htmlPage(title: string, message: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{max-width:480px;padding:32px;background:#1e293b;border-radius:12px;text-align:center}h1{margin:0 0 12px;font-size:20px}p{margin:0;color:#94a3b8;line-height:1.5}</style>
</head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const category = url.searchParams.get('category') ?? null;

  if (!token) {
    return new Response(htmlPage('Invalid Link', 'No unsubscribe token was provided.'), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html' },
    });
  }

  try {
    const { data, error } = await supabase.rpc('consume_unsubscribe_token', {
      p_token: token, p_category: category,
    });
    if (error) throw error;
    const ok = (data as any)?.ok;
    const already = (data as any)?.already;
    if (!ok) {
      return new Response(htmlPage('Invalid Link', 'This unsubscribe link is invalid or has expired.'), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html' },
      });
    }
    return new Response(htmlPage(
      already ? 'Already Unsubscribed' : 'Unsubscribed',
      'You will no longer receive these emails. If this was a mistake, contact your accountant to re-subscribe.',
    ), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
  } catch (e) {
    console.error('unsubscribe error', e);
    return new Response(htmlPage('Error', 'Something went wrong. Please try again later.'), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html' },
    });
  }
});