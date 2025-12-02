import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType: string; body?: { data?: string }; parts?: any[] }>;
  };
  internalDate: string;
}

// Refresh access token if expired
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      console.error('Token refresh failed:', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

// Get header value from Gmail message
function getHeader(headers: Array<{ name: string; value: string }>, name: string): string | undefined {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;
}

// Parse email address from header
function parseEmailAddress(header: string | undefined): { email: string; name?: string } | null {
  if (!header) return null;
  
  // Format: "Name <email@example.com>" or just "email@example.com"
  const match = header.match(/(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?/);
  if (match) {
    return {
      name: match[1]?.trim() || undefined,
      email: match[2].trim().toLowerCase(),
    };
  }
  return null;
}

// Parse multiple email addresses
function parseEmailAddresses(header: string | undefined): string[] {
  if (!header) return [];
  
  return header.split(',')
    .map(addr => parseEmailAddress(addr.trim())?.email)
    .filter((email): email is string => !!email);
}

// Decode base64url encoded content
function decodeBase64Url(data: string): string {
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(escape(atob(base64)));
  } catch {
    return '';
  }
}

// Extract body from Gmail message
function extractBody(payload: GmailMessage['payload']): { html?: string; text?: string } {
  const result: { html?: string; text?: string } = {};

  function processPayload(p: any) {
    if (p.body?.data) {
      const decoded = decodeBase64Url(p.body.data);
      if (p.mimeType === 'text/html') {
        result.html = decoded;
      } else if (p.mimeType === 'text/plain') {
        result.text = decoded;
      }
    }
    if (p.parts) {
      for (const part of p.parts) {
        processPayload(part);
      }
    }
  }

  processPayload(payload);
  return result;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    // Parse request body
    let mailboxId: string | undefined;
    let maxMessages = 50;
    try {
      const body = await req.json();
      mailboxId = body.mailbox_id;
      maxMessages = body.max_messages || 50;
    } catch {
      // No body
    }

    // Build query for mailboxes
    let query = supabase
      .from('connected_mailboxes')
      .select('*')
      .eq('status', 'active')
      .eq('sync_enabled', true);

    if (mailboxId) {
      query = query.eq('id', mailboxId);
    }

    const { data: mailboxes, error: mailboxError } = await query;

    if (mailboxError) {
      console.error('Failed to fetch mailboxes:', mailboxError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch mailboxes' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!mailboxes || mailboxes.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active mailboxes to sync', synced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Array<{ mailbox: string; synced: number; error?: string }> = [];

    for (const mailbox of mailboxes) {
      try {
        let accessToken = mailbox.access_token;

        // Check if token needs refresh
        if (mailbox.token_expires_at && new Date(mailbox.token_expires_at) <= new Date()) {
          if (!mailbox.refresh_token) {
            console.error('No refresh token for mailbox:', mailbox.id);
            await supabase
              .from('connected_mailboxes')
              .update({ status: 'expired', error_message: 'Token expired, no refresh token' })
              .eq('id', mailbox.id);
            results.push({ mailbox: mailbox.email_address, synced: 0, error: 'Token expired' });
            continue;
          }

          const newTokens = await refreshAccessToken(mailbox.refresh_token);
          if (!newTokens) {
            await supabase
              .from('connected_mailboxes')
              .update({ status: 'expired', error_message: 'Token refresh failed' })
              .eq('id', mailbox.id);
            results.push({ mailbox: mailbox.email_address, synced: 0, error: 'Token refresh failed' });
            continue;
          }

          accessToken = newTokens.access_token;
          const expiresAt = new Date(Date.now() + (newTokens.expires_in * 1000)).toISOString();
          
          await supabase
            .from('connected_mailboxes')
            .update({ access_token: accessToken, token_expires_at: expiresAt })
            .eq('id', mailbox.id);
        }

        // Fetch messages from Gmail
        let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxMessages}`;
        
        // Use history API for incremental sync if we have a cursor
        if (mailbox.sync_cursor) {
          // Get messages since last sync using history
          const historyUrl = `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${mailbox.sync_cursor}&historyTypes=messageAdded`;
          const historyResponse = await fetch(historyUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            if (historyData.history) {
              // Extract message IDs from history
              const messageIds = new Set<string>();
              for (const h of historyData.history) {
                if (h.messagesAdded) {
                  for (const m of h.messagesAdded) {
                    messageIds.add(m.message.id);
                  }
                }
              }
              
              // If we have new messages, process them
              if (messageIds.size > 0) {
                let syncedCount = 0;
                for (const messageId of messageIds) {
                  const synced = await syncMessage(supabase, mailbox, accessToken, messageId);
                  if (synced) syncedCount++;
                }
                
                // Update sync cursor
                if (historyData.historyId) {
                  await supabase
                    .from('connected_mailboxes')
                    .update({ sync_cursor: historyData.historyId, last_sync_at: new Date().toISOString() })
                    .eq('id', mailbox.id);
                }
                
                results.push({ mailbox: mailbox.email_address, synced: syncedCount });
                continue;
              }
            }
            
            // Update sync time even if no new messages
            await supabase
              .from('connected_mailboxes')
              .update({ last_sync_at: new Date().toISOString() })
              .eq('id', mailbox.id);
            
            results.push({ mailbox: mailbox.email_address, synced: 0 });
            continue;
          }
        }

        // Initial sync or history not available - fetch recent messages
        const listResponse = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!listResponse.ok) {
          const errorText = await listResponse.text();
          console.error('Gmail list failed:', errorText);
          results.push({ mailbox: mailbox.email_address, synced: 0, error: 'List failed' });
          continue;
        }

        const listData = await listResponse.json();
        let syncedCount = 0;
        let latestHistoryId: string | undefined;

        if (listData.messages) {
          for (const msg of listData.messages) {
            const synced = await syncMessage(supabase, mailbox, accessToken, msg.id);
            if (synced) syncedCount++;
          }
        }

        // Get profile for history ID
        const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (profileResponse.ok) {
          const profile = await profileResponse.json();
          latestHistoryId = profile.historyId;
        }

        // Update mailbox
        await supabase
          .from('connected_mailboxes')
          .update({
            sync_cursor: latestHistoryId || mailbox.sync_cursor,
            last_sync_at: new Date().toISOString(),
            error_message: null,
          })
          .eq('id', mailbox.id);

        results.push({ mailbox: mailbox.email_address, synced: syncedCount });

      } catch (error) {
        console.error('Sync error for mailbox:', mailbox.id, error);
        results.push({ mailbox: mailbox.email_address, synced: 0, error: String(error) });
      }
    }

    return new Response(
      JSON.stringify({ results, total_synced: results.reduce((acc, r) => acc + r.synced, 0) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Gmail sync error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Sync a single message
async function syncMessage(
  supabase: any,
  mailbox: any,
  accessToken: string,
  messageId: string
): Promise<boolean> {
  try {
    // Check if message already exists
    const { data: existing } = await supabase
      .from('email_messages')
      .select('id')
      .eq('mailbox_id', mailbox.id)
      .eq('message_id', messageId)
      .single();

    if (existing) {
      return false; // Already synced
    }

    // Fetch full message
    const msgResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!msgResponse.ok) {
      console.error('Failed to fetch message:', messageId);
      return false;
    }

    const message: GmailMessage = await msgResponse.json();
    const headers = message.payload.headers;

    const from = parseEmailAddress(getHeader(headers, 'From'));
    const toAddresses = parseEmailAddresses(getHeader(headers, 'To'));
    const ccAddresses = parseEmailAddresses(getHeader(headers, 'Cc'));
    const subject = getHeader(headers, 'Subject');
    const body = extractBody(message.payload);

    // Determine direction
    const direction = from?.email === mailbox.email_address ? 'outbound' : 'inbound';

    // Try to auto-match to client/company
    const matchEmail = direction === 'inbound' ? from?.email : toAddresses[0];
    let clientId: string | undefined;
    let companyId: string | undefined;

    if (matchEmail) {
      // Check clients
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('organization_id', mailbox.organization_id)
        .ilike('email', matchEmail)
        .single();

      if (client) {
        clientId = client.id;
      } else {
        // Check companies
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('organization_id', mailbox.organization_id)
          .ilike('email', matchEmail)
          .single();

        if (company) {
          companyId = company.id;
        }
      }
    }

    // Insert email
    const { error: insertError } = await supabase
      .from('email_messages')
      .insert({
        organization_id: mailbox.organization_id,
        mailbox_id: mailbox.id,
        thread_id: message.threadId,
        message_id: message.id,
        from_email: from?.email || '',
        from_name: from?.name,
        to_emails: toAddresses,
        cc_emails: ccAddresses,
        subject,
        body_html: body.html,
        body_text: body.text,
        sent_at: new Date(parseInt(message.internalDate)).toISOString(),
        received_at: direction === 'inbound' ? new Date(parseInt(message.internalDate)).toISOString() : null,
        direction,
        is_read: !message.labelIds?.includes('UNREAD'),
        labels: message.labelIds || [],
        client_id: clientId,
        company_id: companyId,
        matched_at: clientId || companyId ? new Date().toISOString() : null,
        matched_by: clientId || companyId ? 'auto' : null,
      });

    if (insertError) {
      console.error('Failed to insert email:', insertError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Sync message error:', error);
    return false;
  }
}
