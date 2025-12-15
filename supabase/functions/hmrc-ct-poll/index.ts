import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * HMRC CT600 Poll Edge Function
 * Queue-driven polling for CT600 submission status
 * Called by pg_cron, not by user request
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

// ============= XML PARSING =============

interface GovTalkResponse {
  qualifier: 'acknowledgement' | 'response' | 'error';
  correlationId?: string;
  pollInterval?: number;
  receiptReference?: string;
  errors?: Array<{ code: string; message: string }>;
}

function extractXmlValue(xml: string, tagName: string): string | undefined {
  const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i');
  const match = xml.match(regex);
  return match?.[1] || undefined;
}

function parseGovTalkResponse(responseXml: string): GovTalkResponse {
  try {
    const qualifierStr = extractXmlValue(responseXml, 'Qualifier');
    const qualifier = (qualifierStr?.toLowerCase() || 'error') as 'acknowledgement' | 'response' | 'error';
    
    const correlationId = extractXmlValue(responseXml, 'CorrelationID');
    const pollIntervalStr = extractXmlValue(responseXml, 'PollInterval');
    const pollInterval = pollIntervalStr ? parseInt(pollIntervalStr, 10) : undefined;
    const receiptReference = extractXmlValue(responseXml, 'ReceiptReference') || extractXmlValue(responseXml, 'IRmarkReceipt');
    
    const errors: Array<{ code: string; message: string }> = [];
    const errorRegex = /<Error[^>]*>([\s\S]*?)<\/Error>/gi;
    let errorMatch;
    while ((errorMatch = errorRegex.exec(responseXml)) !== null) {
      const errorContent = errorMatch[1];
      const code = extractXmlValue(errorContent, 'Number') || extractXmlValue(errorContent, 'Code') || 'UNKNOWN';
      const message = extractXmlValue(errorContent, 'Text') || extractXmlValue(errorContent, 'Message') || 'Unknown error';
      errors.push({ code, message });
    }
    
    return {
      qualifier: errors.length > 0 && qualifier !== 'response' ? 'error' : qualifier,
      correlationId,
      pollInterval,
      receiptReference,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    return {
      qualifier: 'error',
      errors: [{ code: 'PARSE_EXCEPTION', message: String(error) }]
    };
  }
}

// ============= GOVTALK POLL ENVELOPE =============

function buildGovTalkPollEnvelope(correlationId: string, gatewayId: string, gatewayPassword: string): string {
  const passwordHash = md5HashSync(gatewayPassword);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>2.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>HMRC-CT-CT600</Class>
      <Qualifier>poll</Qualifier>
      <Function>submit</Function>
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
    console.log('[hmrc-ct-poll] No credentials configured, skipping');
    return new Response(JSON.stringify({ processed: 0, message: 'No credentials' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Fetch pending poll jobs
    const { data: pendingJobs, error: fetchError } = await supabase
      .from('filing_queue')
      .select('*, filing:filing_id(id, organization_id, hmrc_correlation_id, company_id, period_end)')
      .eq('filing_type', 'CT600_HMRC')
      .eq('status', 'pending')
      .lte('next_attempt_at', new Date().toISOString())
      .order('next_attempt_at', { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error('[hmrc-ct-poll] Failed to fetch jobs:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
      });
    }

    if (!pendingJobs?.length) {
      console.log('[hmrc-ct-poll] No pending jobs');
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[hmrc-ct-poll] Processing ${pendingJobs.length} jobs`);
    let processed = 0;

    for (const job of pendingJobs) {
      const correlationId = job.filing?.hmrc_correlation_id || job.idempotency_key?.replace('poll:', '');
      
      if (!correlationId) {
        console.warn(`[hmrc-ct-poll] No correlationId for job ${job.id}`);
        await supabase.from('filing_queue').update({
          status: 'failed',
          error_message: 'No correlation ID'
        }).eq('id', job.id);
        continue;
      }

      // Mark as processing
      await supabase.from('filing_queue').update({
        status: 'processing',
        last_attempt_at: new Date().toISOString(),
        attempts: (job.attempts || 0) + 1
      }).eq('id', job.id);

      try {
        // Get environment from submission
        const { data: submission } = await supabase
          .from('filing_submissions')
          .select('environment')
          .eq('filing_id', job.filing_id)
          .eq('status', 'submitted')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        const environment = (submission?.environment || 'test') as 'test' | 'production';
        const hmrcEndpoint = HMRC_CT_ENDPOINTS[environment];

        // Build poll request
        const pollXml = buildGovTalkPollEnvelope(correlationId, gatewayId, gatewayPassword);

        // Send poll request
        const response = await fetch(hmrcEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/xml', 'Accept': 'application/xml' },
          body: pollXml,
        });

        const responseXml = await response.text();
        const parsed = parseGovTalkResponse(responseXml);

        // Store poll response artefact
        const responseHash = await sha256Hash(responseXml);
        await supabase.from('filing_artefacts').insert({
          filing_id: job.filing_id,
          organization_id: job.organization_id,
          artefact_type: 'HMRC_CT_POLL_RESPONSE',
          content: responseXml,
          content_hash: responseHash,
          content_encoding: 'utf8',
          metadata: { pollCount: job.attempts + 1, qualifier: parsed.qualifier, timestamp: new Date().toISOString() }
        });

        if (parsed.qualifier === 'acknowledgement') {
          // Still pending - requeue
          const nextDelay = (parsed.pollInterval || 5) * 1000;
          
          if ((job.attempts || 0) + 1 >= (job.max_attempts || 100)) {
            // Max polls reached
            await supabase.from('filing_queue').update({
              status: 'failed',
              error_message: 'Max poll attempts reached'
            }).eq('id', job.id);

            await supabase.from('filings').update({ status: 'submission_failed' }).eq('id', job.filing_id);
          } else {
            // Requeue for next poll
            await supabase.from('filing_queue').update({
              status: 'pending',
              next_attempt_at: new Date(Date.now() + nextDelay).toISOString()
            }).eq('id', job.id);
          }

          console.log(`[hmrc-ct-poll] Job ${job.id} still pending, requeued`);

        } else if (parsed.qualifier === 'response') {
          // Final response received
          console.log(`[hmrc-ct-poll] Job ${job.id} received final response`);

          // Store final response artefact
          await supabase.from('filing_artefacts').insert({
            filing_id: job.filing_id,
            organization_id: job.organization_id,
            artefact_type: 'HMRC_CT_FINAL_RESPONSE',
            content: responseXml,
            content_hash: responseHash,
            content_encoding: 'utf8',
            metadata: { receiptReference: parsed.receiptReference, timestamp: new Date().toISOString() }
          });

          // Mark job as completed
          await supabase.from('filing_queue').update({
            status: 'completed',
            completed_at: new Date().toISOString()
          }).eq('id', job.id);

          // Update filing to accepted
          await supabase.from('filings').update({
            status: 'accepted',
            hmrc_receipt_number: parsed.receiptReference,
            poll_count: (job.attempts || 0) + 1,
            last_poll_at: new Date().toISOString()
          }).eq('id', job.filing_id);

          // Update submission
          await supabase.from('filing_submissions').update({
            status: 'accepted',
            response_payload: responseXml
          }).eq('filing_id', job.filing_id).eq('status', 'submitted');

          // Queue delete job
          await supabase.from('filing_queue').insert({
            organization_id: job.organization_id,
            filing_id: job.filing_id,
            filing_type: 'CT600_HMRC_DELETE',
            status: 'pending',
            idempotency_key: `delete:${correlationId}`,
            next_attempt_at: new Date().toISOString()
          });

          // Audit log
          await supabase.from('audit_log').insert({
            organization_id: job.organization_id,
            entity_type: 'filing',
            entity_id: job.filing_id,
            action: 'hmrc_ct_accepted',
            metadata: { correlationId, receiptReference: parsed.receiptReference }
          });

        } else if (parsed.qualifier === 'error') {
          // Error response
          console.error(`[hmrc-ct-poll] Job ${job.id} error:`, parsed.errors);

          await supabase.from('filing_queue').update({
            status: 'failed',
            error_message: parsed.errors?.map(e => `${e.code}: ${e.message}`).join('; ')
          }).eq('id', job.id);

          await supabase.from('filings').update({ status: 'submission_failed' }).eq('id', job.filing_id);

          await supabase.from('filing_submissions').update({
            status: 'failed',
            error_message: parsed.errors?.map(e => `${e.code}: ${e.message}`).join('; ')
          }).eq('filing_id', job.filing_id).eq('status', 'submitted');
        }

        processed++;

      } catch (pollError) {
        console.error(`[hmrc-ct-poll] Job ${job.id} error:`, pollError);
        
        // Requeue on error (unless max attempts)
        if ((job.attempts || 0) + 1 >= (job.max_attempts || 100)) {
          await supabase.from('filing_queue').update({
            status: 'failed',
            error_message: String(pollError)
          }).eq('id', job.id);
        } else {
          await supabase.from('filing_queue').update({
            status: 'pending',
            error_message: String(pollError),
            next_attempt_at: new Date(Date.now() + 30000).toISOString() // Retry in 30s
          }).eq('id', job.id);
        }
      }
    }

    console.log(`[hmrc-ct-poll] Processed ${processed} jobs`);
    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[hmrc-ct-poll] Unexpected error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    });
  }
});
