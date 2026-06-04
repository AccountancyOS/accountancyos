import type { PortalConversation, PortalMessage } from "../types";

// TODO(batch-2): derive conversations from client_messages.
export async function listPortalConversations(): Promise<PortalConversation[]> {
  return [];
}

export async function listPortalMessages(_conversationId: string): Promise<PortalMessage[]> {
  return [];
}

// TODO(batch-2): insert via RPC that enforces portal scope.
export async function sendPortalMessage(_conversationId: string, _body: string): Promise<void> {
  return;
}