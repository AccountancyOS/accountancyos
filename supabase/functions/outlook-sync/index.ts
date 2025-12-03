import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MICROSOFT_CLIENT_ID = Deno.env.get('MICROSOFT_CLIENT_ID');
const MICROSOFT_CLIENT_SECRET = Deno.env.get('MICROSOFT_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface OutlookMessage {
  id: string;
  conversationId: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  body: {
    contentType: string;
    content: string;
  };
  receivedDateTime: string;
  sentDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
}

interface MatchedEntity {
  entity_type: string;
  entity_id: string;
  entity_name: string;
  match_source: string;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; refresh_token?: string } | null> {
  try {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID!,
        client_secret: MICROSOFT_CLIENT_SECRET!,
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

// Find all matching entities for email addresses using the database function
async function findMatchingEntities(
  supabase: any,
  orgId: string,
  emails: string[]
): Promise<MatchedEntity[]> {
  const matches: MatchedEntity[] = [];
  const seen = new Set<string>();
  
  for (const email of emails) {
    if (!email) continue;
    
    try {
      const { data, error } = await supabase.rpc('find_entities_by_email', {
        _org_id: orgId,
        _email: email
      });
      
      if (error) {
        console.error('Error finding entities for email:', email, error);
        continue;
      }
      
      if (data) {
        for (const match of data) {
          const key = `${match.entity_type}-${match.entity_id}`;
          if (!seen.has(key)) {
            seen.add(key);
            matches.push({
              entity_type: match.entity_type,
              entity_id: match.entity_id,
              entity_name: match.entity_name,
              match_source: match.match_source,
            });
          }
        }
      }
    } catch (err) {
      console.error('Exception finding entities for email:', email, err);
    }
  }
  
  return matches;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get mailbox_id from body if specific sync requested
    let targetMailboxId: string | null = null;
    try {
      const body = await req.json();
      targetMailboxId = body.mailbox_id || null;
    } catch {
      // No body
    }

    // Fetch Outlook mailboxes to sync
    let query = supabase
      .from('connected_mailboxes')
      .select('*')
      .eq('provider', 'outlook')
      .eq('status', 'active')
      .eq('sync_enabled', true);

    if (targetMailboxId) {
      query = query.eq('id', targetMailboxId);
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
        JSON.stringify({ message: 'No Outlook mailboxes to sync', total_synced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: Record<string, { synced: number; errors: number }> = {};

    for (const mailbox of mailboxes) {
      results[mailbox.email_address] = { synced: 0, errors: 0 };

      let accessToken = mailbox.access_token;

      // Check if token needs refresh
      if (mailbox.token_expires_at && new Date(mailbox.token_expires_at) < new Date()) {
        console.log(`Refreshing token for ${mailbox.email_address}`);
        const newTokens = await refreshAccessToken(mailbox.refresh_token);

        if (!newTokens) {
          await supabase
            .from('connected_mailboxes')
            .update({
              status: 'error',
              error_message: 'Token refresh failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', mailbox.id);
          results[mailbox.email_address].errors++;
          continue;
        }

        accessToken = newTokens.access_token;
        await supabase
          .from('connected_mailboxes')
          .update({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token || mailbox.refresh_token,
            token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', mailbox.id);
      }

      try {
        // Build query for messages - get recent messages or use delta if available
        let messagesUrl = 'https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime desc&$select=id,conversationId,subject,from,toRecipients,ccRecipients,body,receivedDateTime,sentDateTime,isRead,hasAttachments';

        // If we have a sync cursor (deltaLink), use it
        if (mailbox.sync_cursor && mailbox.sync_cursor.startsWith('https://')) {
          messagesUrl = mailbox.sync_cursor;
        }

        const messagesResponse = await fetch(messagesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!messagesResponse.ok) {
          const errorText = await messagesResponse.text();
          console.error(`Messages fetch failed for ${mailbox.email_address}:`, errorText);
          results[mailbox.email_address].errors++;
          continue;
        }

        const messagesData = await messagesResponse.json();
        const messages: OutlookMessage[] = messagesData.value || [];

        for (const msg of messages) {
          // Check if message already exists
          const { data: existing } = await supabase
            .from('email_messages')
            .select('id')
            .eq('message_id', msg.id)
            .eq('mailbox_id', mailbox.id)
            .single();

          if (existing) continue;

          // Determine direction
          const fromEmail = msg.from?.emailAddress?.address?.toLowerCase() || '';
          const direction = fromEmail === mailbox.email_address.toLowerCase() ? 'outbound' : 'inbound';

          // Extract recipients
          const toEmails = msg.toRecipients?.map(r => r.emailAddress.address.toLowerCase()) || [];
          const ccEmails = msg.ccRecipients?.map(r => r.emailAddress.address.toLowerCase()) || [];

          // Collect ALL email addresses for matching
          const allEmails: string[] = [];
          if (fromEmail) allEmails.push(fromEmail);
          allEmails.push(...toEmails);
          allEmails.push(...ccEmails);

          // Find all matching entities using the database function
          const matchedEntities = await findMatchingEntities(supabase, mailbox.organization_id, allEmails);

          // Determine primary client_id and company_id (first match of each type)
          const primaryClient = matchedEntities.find(m => m.entity_type === 'client');
          const primaryCompany = matchedEntities.find(m => m.entity_type === 'company');

          console.log(`Message ${msg.id}: Found ${matchedEntities.length} matching entities`);

          // Extract body text
          let bodyHtml = '';
          let bodyText = '';
          if (msg.body.contentType === 'html') {
            bodyHtml = msg.body.content;
            bodyText = msg.body.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          } else {
            bodyText = msg.body.content;
          }

          // Insert message with multi-entity support
          const { error: insertError } = await supabase
            .from('email_messages')
            .insert({
              mailbox_id: mailbox.id,
              organization_id: mailbox.organization_id,
              message_id: msg.id,
              thread_id: msg.conversationId,
              subject: msg.subject,
              from_email: fromEmail,
              from_name: msg.from?.emailAddress?.name || null,
              to_emails: toEmails,
              cc_emails: ccEmails.length > 0 ? ccEmails : null,
              body_html: bodyHtml || null,
              body_text: bodyText || null,
              direction: direction,
              is_read: msg.isRead,
              received_at: msg.receivedDateTime,
              sent_at: msg.sentDateTime,
              client_id: primaryClient?.entity_id || null,
              company_id: primaryCompany?.entity_id || null,
              matched_by: matchedEntities.length > 0 ? 'auto' : null,
              matched_at: matchedEntities.length > 0 ? new Date().toISOString() : null,
              matched_entities: matchedEntities, // Store all matched entities
            });

          if (insertError) {
            console.error('Insert error:', insertError);
            results[mailbox.email_address].errors++;
          } else {
            results[mailbox.email_address].synced++;
          }
        }

        // Update sync cursor and last_sync_at
        const updateData: Record<string, unknown> = {
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Store delta link if available
        if (messagesData['@odata.deltaLink']) {
          updateData.sync_cursor = messagesData['@odata.deltaLink'];
        }

        await supabase
          .from('connected_mailboxes')
          .update(updateData)
          .eq('id', mailbox.id);

      } catch (error) {
        console.error(`Sync error for ${mailbox.email_address}:`, error);
        results[mailbox.email_address].errors++;
      }
    }

    const totalSynced = Object.values(results).reduce((sum, r) => sum + r.synced, 0);

    return new Response(
      JSON.stringify({
        message: 'Outlook sync complete',
        total_synced: totalSynced,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Outlook sync error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
