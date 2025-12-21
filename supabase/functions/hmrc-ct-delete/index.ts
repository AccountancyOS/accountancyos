import { serve } from "@std/http";
import { createClient } from "@supabase/supabase-js";

/**
 * HMRC CT600 Delete Edge Function
 * Queue-driven deletion of processed GovTalk messages
 * Called by pg_cron after final response received
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HMRC_CT_ENDPOINTS = {
  test: 'https://test-transaction-engine.tax.service.gov.uk/submission',
  production: 'https://transaction-engine.tax.service.gov.uk/submission',
};

// ============= XML UTILITIES =============

function escapeXmlSafe(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

function md5HashSync(str: string): string {
  function md5cycle(x: number[], k: number[]) {
    let a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);
    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);
    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);
    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);
    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(c ^ (b | (~d)), a, b, x, s, t);
  }
  function add32(a: number, b: number): number {
    return (a + b) & 0xFFFFFFFF;
  }
  function md5blk(s: string): number[] {
    const md5blks: number[] = [];
    for (let i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + 
                        (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }
  let n = str.length;
  let state = [1732584193, -271733879, -1732584194, 271733878];
  let i: number;
  for (i = 64; i <= str.length; i += 64) {
    md5cycle(state, md5blk(str.substring(i - 64, i)));
  }
  str = str.substring(i - 64);
  const tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (i = 0; i < str.length; i++) {
    tail[i >> 2] |= str.charCodeAt(i) << ((i % 4) << 3);
  }
  tail[i >> 2] |= 0x80 << ((i % 4) << 3);
  if (i > 55) {
    md5cycle(state, tail);
    for (i = 0; i < 16; i++) tail[i] = 0;
  }
  tail[14] = n * 8;
  md5cycle(state, tail);
  const hex = '0123456789abcdef';
  let result = '';
  for (i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      result += hex.charAt((state[i] >> (j * 8 + 4)) & 0x0F) + 
                hex.charAt((state[i] >> (j * 8)) & 0x0F);
    }
  }
  return result;
}

async function sha256Hash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============= GOVTALK DELETE ENVELOPE =============

function buildGovTalkDeleteEnvelope(correlationId: string, gatewayId: string, gatewayPassword: string): string {
  const passwordHash = md5HashSync(gatewayPassword);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-CT-CT600</Class>
      <Qualifier>request</Qualifier>
      <Function>delete</Function>
      <CorrelationID>${escapeXmlSafe(correlationId)}</CorrelationID>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${escapeXmlSafe(gatewayId)}</SenderID>
        <Authentication>
          <Method>MD5</Method>
          <Role>principal</Role>
          <Value>${passwordHash}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys/>
  </GovTalkDetails>
  <Body/>
</GovTalkMessage>`;
}

// ============= MAIN HANDLER =============

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const gatewayId = Deno.env.get('HMRC_CT_GATEWAY_ID');
  const gatewayPassword = Deno.env.get('HMRC_CT_GATEWAY_PASSWORD');

  if (!gatewayId || !gatewayPassword) {
    console.log('[hmrc-ct-delete] No credentials configured, skipping');
    return new Response(JSON.stringify({ processed: 0, message: 'No credentials' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Fetch pending delete jobs
    const { data: pendingJobs, error: fetchError } = await supabase
      .from('filing_queue')
      .select('*, filing:filing_id(id, organization_id, hmrc_correlation_id)')
      .eq('filing_type', 'CT600_HMRC_DELETE')
      .eq('status', 'pending')
      .lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error('[hmrc-ct-delete] Failed to fetch jobs:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
      });
    }

    if (!pendingJobs?.length) {
      console.log('[hmrc-ct-delete] No pending delete jobs');
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[hmrc-ct-delete] Processing ${pendingJobs.length} delete jobs`);
    let processed = 0;

    for (const job of pendingJobs) {
      const correlationId = job.filing?.hmrc_correlation_id || job.metadata?.correlationId || job.idempotency_key?.replace('delete:', '');
      
      if (!correlationId) {
        console.warn(`[hmrc-ct-delete] No correlationId for job ${job.id}`);
        await supabase.from('filing_queue').update({
          status: 'completed',
          error_message: 'No correlation ID - marking complete'
        }).eq('id', job.id);
        
        // Still mark as filed since delete is best-effort
        await supabase.from('filings').update({ status: 'filed' }).eq('id', job.filing_id);
        continue;
      }

      // Mark as processing
      await supabase.from('filing_queue').update({
        status: 'processing',
        last_attempt_at: new Date().toISOString(),
        attempts: (job.attempts || 0) + 1
      }).eq('id', job.id);

      try {
        // Get environment from metadata or submission
        let environment = job.metadata?.environment as 'test' | 'production';
        if (!environment) {
          const { data: submission } = await supabase
            .from('filing_submissions')
            .select('environment')
            .eq('filing_id', job.filing_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          environment = (submission?.environment || 'test') as 'test' | 'production';
        }

        const hmrcEndpoint = HMRC_CT_ENDPOINTS[environment];

        // Build delete request
        const deleteXml = buildGovTalkDeleteEnvelope(correlationId, gatewayId, gatewayPassword);

        // Store delete request artefact
        const requestHash = await sha256Hash(deleteXml);
        await supabase.from('filing_artefacts').insert({
          filing_id: job.filing_id,
          organization_id: job.organization_id,
          artefact_type: 'HMRC_CT600_DELETE_REQUEST_XML',
          content: deleteXml,
          content_hash: requestHash,
          content_encoding: 'utf8',
          metadata: { correlationId, timestamp: new Date().toISOString() }
        });

        // Send delete request
        const response = await fetch(hmrcEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
          body: deleteXml,
        });

        const responseXml = await response.text();

        // Store delete response artefact
        const responseHash = await sha256Hash(responseXml);
        await supabase.from('filing_artefacts').insert({
          filing_id: job.filing_id,
          organization_id: job.organization_id,
          artefact_type: 'HMRC_CT600_DELETE_RESPONSE_XML',
          content: responseXml,
          content_hash: responseHash,
          content_encoding: 'utf8',
          metadata: { responseStatus: response.status, timestamp: new Date().toISOString() }
        });

        // Mark job as completed (delete is best-effort, we don't fail on HMRC errors)
        await supabase.from('filing_queue').update({
          status: 'completed',
          completed_at: new Date().toISOString()
        }).eq('id', job.id);

        // Update filing status to filed (final status)
        await supabase.from('filings').update({
          status: 'filed'
        }).eq('id', job.filing_id);

        // Audit log
        await supabase.from('audit_log').insert({
          organization_id: job.organization_id,
          entity_type: 'filing',
          entity_id: job.filing_id,
          action: 'hmrc_ct_filed',
          metadata: { correlationId, responseStatus: response.status }
        });

        console.log(`[hmrc-ct-delete] Job ${job.id} completed`);
        processed++;

      } catch (deleteError) {
        console.error(`[hmrc-ct-delete] Job ${job.id} error:`, deleteError);
        
        // Delete failures are non-critical, mark as completed anyway
        await supabase.from('filing_queue').update({
          status: 'completed',
          error_message: `Delete attempt failed: ${String(deleteError)}`,
          completed_at: new Date().toISOString()
        }).eq('id', job.id);

        // Still mark filing as filed
        await supabase.from('filings').update({
          status: 'filed'
        }).eq('id', job.filing_id);
      }
    }

    console.log(`[hmrc-ct-delete] Processed ${processed} delete jobs`);
    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[hmrc-ct-delete] Unexpected error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    });
  }
});
