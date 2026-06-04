import { supabase } from "@/integrations/supabase/client";
import type { PortalConversation, PortalEntity, PortalMessage } from "../types";

/**
 * Conversations are derived from public.client_messages, grouped by the root
 * message (parent_message_id IS NULL). Unread counts are 0 in Batch 2 — a
 * per-user read-receipt table is a Batch 3 backlog item.
 */
export async function listPortalConversations(
  entity: PortalEntity | null,
): Promise<PortalConversation[]> {
  if (!entity) return [];
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data, error } = await supabase
    .from("client_messages")
    .select("id, subject, content, parent_message_id, created_at")
    .eq(col, entity.id)
    .eq("visibility", "client_visible")
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  // Group by root (id when parent is null, else parent_message_id).
  type Acc = Record<string, { subject: string; lastMessageAt: string }>;
  const acc: Acc = {};
  const rootOrder: string[] = [];
  for (const m of data) {
    const rootId = (m.parent_message_id as string | null) ?? m.id;
    if (!acc[rootId]) {
      acc[rootId] = {
        subject: m.subject ?? (m.content?.slice(0, 60) ?? "Conversation"),
        lastMessageAt: m.created_at,
      };
      rootOrder.push(rootId);
    } else if (m.created_at > acc[rootId].lastMessageAt) {
      acc[rootId].lastMessageAt = m.created_at;
    }
  }

  return rootOrder.map((id) => ({
    id,
    type: "general",
    subject: acc[id].subject,
    lastMessageAt: acc[id].lastMessageAt,
    unreadCount: 0,
    relatedJobId: null,
  }));
}

export async function listPortalMessages(
  rootMessageId: string,
): Promise<PortalMessage[]> {
  // Root message + all descendants (single-level threading on client_messages).
  const { data, error } = await supabase
    .from("client_messages")
    .select("id, subject, content, sender_type, created_at, parent_message_id")
    .or(`id.eq.${rootMessageId},parent_message_id.eq.${rootMessageId}`)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((m) => ({
    id: m.id,
    conversationId: rootMessageId,
    sender: m.sender_type === "client" ? "client" : "accountant",
    sentAt: m.created_at,
    body: m.content,
    senderName: null,
  }));
}

export async function sendPortalMessage(args: {
  entity: PortalEntity;
  body: string;
  subject?: string | null;
  parentMessageId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("portal_send_message", {
    p_client_id: args.entity.type === "client" ? args.entity.id : null,
    p_company_id: args.entity.type === "company" ? args.entity.id : null,
    p_body: args.body,
    p_subject: args.subject ?? null,
    p_parent_message_id: args.parentMessageId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}