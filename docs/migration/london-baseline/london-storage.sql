--
-- AccountancyOS — London storage bootstrap.
--
-- Apply AFTER london-baseline.sql. Buckets are declarative configuration read from
-- storage.buckets in the verified export (sha256 28420b17…3c5321); the 36 policies are
-- transcribed verbatim from the same export.
--
-- NO storage object, file, or object metadata is read or created by this file.
--
-- Bucket set resolved 2026-08-18 and it contradicts BOTH earlier sources:
--   * infra/supabase-manifest.json names email-assets, documents, filings, kyc — NONE of
--     which exist on the source. That manifest section is fiction and must not be trusted.
--   * `client-documents` appears in migration-authored policies but exists on neither the
--     live bucket list nor any live storage policy.
--   The real set is the 9 buckets below. Only `branding` is public.
--
-- EXCLUDED: `database_export_17_08_26` — not an application bucket. It is where the
-- 2026-08-17 export was staged inside the legacy project, which also means a copy of that
-- archive (containing plaintext mailbox and bank tokens) is sitting in legacy storage and
-- should be removed once the migration completes.
--
-- Buckets referenced by policies : branding, filing-documents, invoice-branding, invoice-pdfs, job-documents, onboarding-documents, questionnaire-files, receipts, workpaper-files
-- Buckets declared here          : branding, filing-documents, invoice-branding, invoice-pdfs, job-documents, onboarding-documents, questionnaire-files, receipts, workpaper-files
-- Reconciled                     : YES — every policy bucket is declared
--

BEGIN;

-- ---------------------------------------------------------------------------------------
-- 1. Buckets (9)
-- ---------------------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('branding', 'branding', true, 2097152, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('filing-documents', 'filing-documents', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoice-branding', 'invoice-branding', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoice-pdfs', 'invoice-pdfs', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('job-documents', 'job-documents', false, 20971520, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('onboarding-documents', 'onboarding-documents', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('questionnaire-files', 'questionnaire-files', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('workpaper-files', 'workpaper-files', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------------------
-- 2. Storage RLS policies (36)
-- ---------------------------------------------------------------------------------------

--
-- Name: objects Org admins can delete filing documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org admins can delete filing documents" ON storage.objects FOR DELETE USING (((bucket_id = 'filing-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = (storage.foldername(objects.name))[1]) AND (ou.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));


--
-- Name: objects Org members can delete job documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can delete job documents" ON storage.objects FOR DELETE USING (((bucket_id = 'job-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = (storage.foldername(objects.name))[1]))))));


--
-- Name: objects Org members can delete onboarding documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can delete onboarding documents" ON storage.objects FOR DELETE USING (((bucket_id = 'onboarding-documents'::text) AND (auth.uid() IS NOT NULL) AND public.user_has_organization_access(((string_to_array(name, '/'::text))[1])::uuid)));


--
-- Name: objects Org members can delete questionnaire files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can delete questionnaire files" ON storage.objects FOR DELETE USING (((bucket_id = 'questionnaire-files'::text) AND (auth.uid() IS NOT NULL) AND public.user_has_organization_access(((string_to_array(name, '/'::text))[1])::uuid)));


--
-- Name: objects Org members can read filing documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can read filing documents" ON storage.objects FOR SELECT USING (((bucket_id = 'filing-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = (storage.foldername(objects.name))[1]))))));


--
-- Name: objects Org members can read invoice PDFs; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can read invoice PDFs" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'invoice-pdfs'::text) AND (EXISTS ( SELECT 1
   FROM (public.invoices i
     JOIN public.organization_users ou ON ((ou.organization_id = i.organization_id)))
  WHERE ((ou.user_id = auth.uid()) AND ((storage.foldername(objects.name))[1] = (i.id)::text))))));


--
-- Name: objects Org members can read job documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can read job documents" ON storage.objects FOR SELECT USING (((bucket_id = 'job-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = (storage.foldername(objects.name))[1]))))));


--
-- Name: objects Org members can update filing documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can update filing documents" ON storage.objects FOR UPDATE USING (((bucket_id = 'filing-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = (storage.foldername(objects.name))[1]))))));


--
-- Name: objects Org members can update onboarding documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can update onboarding documents" ON storage.objects FOR UPDATE USING (((bucket_id = 'onboarding-documents'::text) AND (auth.uid() IS NOT NULL) AND public.user_has_organization_access(((string_to_array(name, '/'::text))[1])::uuid)));


--
-- Name: objects Org members can update questionnaire files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can update questionnaire files" ON storage.objects FOR UPDATE USING (((bucket_id = 'questionnaire-files'::text) AND (auth.uid() IS NOT NULL) AND public.user_has_organization_access(((string_to_array(name, '/'::text))[1])::uuid)));


--
-- Name: objects Org members can upload filing documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can upload filing documents" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'filing-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = (storage.foldername(objects.name))[1]))))));


--
-- Name: objects Org members can upload job documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can upload job documents" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'job-documents'::text) AND (auth.uid() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = (storage.foldername(objects.name))[1]))))));


--
-- Name: objects Org members can upload onboarding documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can upload onboarding documents" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'onboarding-documents'::text) AND (auth.uid() IS NOT NULL) AND public.user_has_organization_access(((string_to_array(name, '/'::text))[1])::uuid)));


--
-- Name: objects Org members can upload questionnaire files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can upload questionnaire files" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'questionnaire-files'::text) AND (auth.uid() IS NOT NULL) AND public.user_has_organization_access(((string_to_array(name, '/'::text))[1])::uuid)));


--
-- Name: objects Org members can view onboarding documents; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can view onboarding documents" ON storage.objects FOR SELECT USING (((bucket_id = 'onboarding-documents'::text) AND (auth.uid() IS NOT NULL) AND public.user_has_organization_access(((string_to_array(name, '/'::text))[1])::uuid)));


--
-- Name: objects Org members can view questionnaire files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Org members can view questionnaire files" ON storage.objects FOR SELECT USING (((bucket_id = 'questionnaire-files'::text) AND (auth.uid() IS NOT NULL) AND public.user_has_organization_access(((string_to_array(name, '/'::text))[1])::uuid)));


--
-- Name: objects Portal clients can upload job document files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Portal clients can upload job document files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'job-documents'::text) AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.id = (NULLIF((storage.foldername(j.name))[2], ''::text))::uuid) AND public.client_has_portal_access(auth.uid(), j.client_id, j.company_id))))));


--
-- Name: objects Portal clients can upload receipt files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Portal clients can upload receipt files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'receipts'::text) AND public.portal_has_perm(
CASE
    WHEN ((storage.foldername(name))[2] = 'client'::text) THEN (NULLIF((storage.foldername(name))[3], ''::text))::uuid
    ELSE NULL::uuid
END,
CASE
    WHEN ((storage.foldername(name))[2] = 'company'::text) THEN (NULLIF((storage.foldername(name))[3], ''::text))::uuid
    ELSE NULL::uuid
END, 'allow_receipt_upload'::text)));


--
-- Name: objects Portal clients can view their receipt files; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Portal clients can view their receipt files" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'receipts'::text) AND (EXISTS ( SELECT 1
   FROM public.receipts r
  WHERE ((r.file_path = objects.name) AND (public.portal_has_perm(r.client_id, r.company_id, 'allow_receipt_upload'::text) OR public.portal_can_access_bookkeeping(r.client_id, r.company_id)))))));


--
-- Name: objects Public can upload onboarding documents with token; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Public can upload onboarding documents with token" ON storage.objects FOR INSERT TO authenticated, anon WITH CHECK (((bucket_id = 'onboarding-documents'::text) AND public.is_active_onboarding_upload_path(name)));


--
-- Name: objects Users can delete receipts in their organization; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can delete receipts in their organization" ON storage.objects FOR DELETE USING (((bucket_id = 'receipts'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users
  WHERE ((organization_users.user_id = auth.uid()) AND ((organization_users.organization_id)::text = (storage.foldername(objects.name))[1]))))));


--
-- Name: objects Users can upload receipts for their organization; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can upload receipts for their organization" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'receipts'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users
  WHERE ((organization_users.user_id = auth.uid()) AND ((organization_users.organization_id)::text = (storage.foldername(objects.name))[1]))))));


--
-- Name: objects Users can view receipts in their organization; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "Users can view receipts in their organization" ON storage.objects FOR SELECT USING (((bucket_id = 'receipts'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users
  WHERE ((organization_users.user_id = auth.uid()) AND ((organization_users.organization_id)::text = (storage.foldername(objects.name))[1]))))));


--
-- Name: objects invoice-branding managed delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "invoice-branding managed delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'invoice-branding'::text) AND public.can_manage_invoice_branding((NULLIF((storage.foldername(name))[1], ''::text))::uuid)));


--
-- Name: objects invoice-branding managed update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "invoice-branding managed update" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'invoice-branding'::text) AND public.can_manage_invoice_branding((NULLIF((storage.foldername(name))[1], ''::text))::uuid)));


--
-- Name: objects invoice-branding managed write; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "invoice-branding managed write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'invoice-branding'::text) AND public.can_manage_invoice_branding((NULLIF((storage.foldername(name))[1], ''::text))::uuid)));


--
-- Name: objects invoice-branding public read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "invoice-branding public read" ON storage.objects FOR SELECT USING ((bucket_id = 'invoice-branding'::text));


--
-- Name: objects invoice-branding read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "invoice-branding read" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'invoice-branding'::text) AND public.can_manage_invoice_branding((NULLIF((storage.foldername(name))[1], ''::text))::uuid)));


--
-- Name: objects org_users_can_delete_branding; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY org_users_can_delete_branding ON storage.objects FOR DELETE USING (((bucket_id = 'branding'::text) AND public.user_has_organization_access(((storage.foldername(name))[1])::uuid)));


--
-- Name: objects org_users_can_read_branding; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY org_users_can_read_branding ON storage.objects FOR SELECT USING (((bucket_id = 'branding'::text) AND public.user_has_organization_access(((storage.foldername(name))[1])::uuid)));


--
-- Name: objects org_users_can_update_branding; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY org_users_can_update_branding ON storage.objects FOR UPDATE USING (((bucket_id = 'branding'::text) AND public.user_has_organization_access(((storage.foldername(name))[1])::uuid)));


--
-- Name: objects org_users_can_upload_branding; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY org_users_can_upload_branding ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'branding'::text) AND public.user_has_organization_access(((storage.foldername(name))[1])::uuid)));


--
-- Name: objects workpaper_files_delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY workpaper_files_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'workpaper-files'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));


--
-- Name: objects workpaper_files_insert; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY workpaper_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'workpaper-files'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));


--
-- Name: objects workpaper_files_select; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY workpaper_files_select ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'workpaper-files'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));


--
-- Name: objects workpaper_files_update; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY workpaper_files_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'workpaper-files'::text) AND (EXISTS ( SELECT 1
   FROM public.organization_users ou
  WHERE ((ou.user_id = auth.uid()) AND ((ou.organization_id)::text = split_part(objects.name, '/'::text, 2)))))));



-- ---------------------------------------------------------------------------------------
-- 3. Post-assertions
-- ---------------------------------------------------------------------------------------

DO $mig$
DECLARE
  v_buckets int;
  v_public  int;
BEGIN
  SELECT count(*) INTO v_buckets FROM storage.buckets
   WHERE id <> 'database_export_17_08_26';
  IF v_buckets < 9 THEN
    RAISE EXCEPTION 'storage bootstrap failed: expected at least % application buckets, found %.', 9, v_buckets;
  END IF;

  SELECT count(*) INTO v_public FROM storage.buckets WHERE public IS TRUE;
  IF v_public <> 1 THEN
    RAISE EXCEPTION 'storage bootstrap failed: expected exactly 1 public bucket (branding), found %.', v_public;
  END IF;

  RAISE NOTICE 'storage bootstrap: % buckets, 1 public.', v_buckets;
END $mig$;

COMMIT;
