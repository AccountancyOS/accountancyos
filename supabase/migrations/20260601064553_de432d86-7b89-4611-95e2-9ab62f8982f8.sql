
REVOKE EXECUTE ON FUNCTION public.resolve_engagement_letter_variant(uuid, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_kyc_pack(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_kyc_subject_progress(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_ch_diff(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_lead_dormant(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_lead_lost(uuid, text) FROM PUBLIC;
