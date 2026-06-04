revoke execute on function public.portal_send_message(uuid,uuid,text,text,uuid) from public, anon;
grant execute on function public.portal_send_message(uuid,uuid,text,text,uuid) to authenticated;