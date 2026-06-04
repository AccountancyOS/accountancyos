create or replace function public.portal_send_message(
  p_client_id uuid,
  p_company_id uuid,
  p_body text,
  p_subject text default null,
  p_parent_message_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
  v_id   uuid;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  if (p_client_id is null) = (p_company_id is null) then
    raise exception 'exactly one of client_id/company_id required';
  end if;
  if length(coalesce(p_body,'')) = 0 then raise exception 'body required'; end if;

  select organization_id into v_org
  from public.portal_access
  where user_id = v_user
    and status = 'active' and is_active = true
    and ((p_client_id is not null and client_id = p_client_id)
      or (p_company_id is not null and company_id = p_company_id))
  limit 1;

  if v_org is null then raise exception 'no portal access'; end if;

  insert into public.client_messages
    (organization_id, client_id, company_id, sender_id, sender_type,
     message_type, visibility, subject, content, parent_message_id)
  values
    (v_org, p_client_id, p_company_id, v_user, 'client',
     'message', 'client_visible', p_subject, p_body, p_parent_message_id)
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.portal_send_message(uuid,uuid,text,text,uuid) to authenticated;