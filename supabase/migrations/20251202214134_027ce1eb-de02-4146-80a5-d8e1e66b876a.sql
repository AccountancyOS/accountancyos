-- Create enum types for connected mailboxes
CREATE TYPE mailbox_provider AS ENUM ('gmail', 'outlook');
CREATE TYPE mailbox_status AS ENUM ('active', 'expired', 'revoked', 'error');
CREATE TYPE email_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE email_match_type AS ENUM ('auto', 'manual');

-- Table 1: connected_mailboxes - Store OAuth credentials and sync state
CREATE TABLE public.connected_mailboxes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider mailbox_provider NOT NULL DEFAULT 'gmail',
  email_address TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  sync_cursor TEXT,
  status mailbox_status NOT NULL DEFAULT 'active',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, email_address)
);

-- Table 2: email_messages - Synced emails
CREATE TABLE public.email_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mailbox_id UUID NOT NULL REFERENCES public.connected_mailboxes(id) ON DELETE CASCADE,
  thread_id TEXT,
  message_id TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_emails TEXT[] DEFAULT '{}',
  cc_emails TEXT[] DEFAULT '{}',
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  direction email_direction NOT NULL DEFAULT 'inbound',
  is_read BOOLEAN DEFAULT false,
  labels TEXT[] DEFAULT '{}',
  attachments JSONB DEFAULT '[]',
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  matched_at TIMESTAMPTZ,
  matched_by email_match_type,
  raw_headers JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(mailbox_id, message_id)
);

-- Table 3: gmail_auth_states - CSRF protection for OAuth
CREATE TABLE public.gmail_auth_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  redirect_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- Enable RLS
ALTER TABLE public.connected_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_auth_states ENABLE ROW LEVEL SECURITY;

-- RLS Policies for connected_mailboxes
CREATE POLICY "Users can view their own mailboxes"
  ON public.connected_mailboxes FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own mailboxes"
  ON public.connected_mailboxes FOR INSERT
  WITH CHECK (user_id = auth.uid() AND user_has_organization_access(organization_id));

CREATE POLICY "Users can update their own mailboxes"
  ON public.connected_mailboxes FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own mailboxes"
  ON public.connected_mailboxes FOR DELETE
  USING (user_id = auth.uid());

-- RLS Policies for email_messages
CREATE POLICY "Org users can view emails"
  ON public.email_messages FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Org users can insert emails"
  ON public.email_messages FOR INSERT
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Org users can update emails"
  ON public.email_messages FOR UPDATE
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Org users can delete emails"
  ON public.email_messages FOR DELETE
  USING (user_has_organization_access(organization_id));

-- RLS Policies for gmail_auth_states
CREATE POLICY "Users can view their own auth states"
  ON public.gmail_auth_states FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own auth states"
  ON public.gmail_auth_states FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own auth states"
  ON public.gmail_auth_states FOR DELETE
  USING (user_id = auth.uid());

-- Indexes for performance
CREATE INDEX idx_connected_mailboxes_org ON public.connected_mailboxes(organization_id);
CREATE INDEX idx_connected_mailboxes_user ON public.connected_mailboxes(user_id);
CREATE INDEX idx_connected_mailboxes_status ON public.connected_mailboxes(status);
CREATE INDEX idx_email_messages_org ON public.email_messages(organization_id);
CREATE INDEX idx_email_messages_mailbox ON public.email_messages(mailbox_id);
CREATE INDEX idx_email_messages_thread ON public.email_messages(thread_id);
CREATE INDEX idx_email_messages_client ON public.email_messages(client_id);
CREATE INDEX idx_email_messages_company ON public.email_messages(company_id);
CREATE INDEX idx_email_messages_from ON public.email_messages(from_email);
CREATE INDEX idx_email_messages_sent ON public.email_messages(sent_at DESC);
CREATE INDEX idx_gmail_auth_states_state ON public.gmail_auth_states(state);
CREATE INDEX idx_gmail_auth_states_expires ON public.gmail_auth_states(expires_at);

-- Trigger for updated_at on connected_mailboxes
CREATE TRIGGER update_connected_mailboxes_updated_at
  BEFORE UPDATE ON public.connected_mailboxes
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Cleanup function for expired auth states
CREATE OR REPLACE FUNCTION public.cleanup_expired_gmail_auth_states()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM gmail_auth_states WHERE expires_at < now();
END;
$$;