-- Create onboarding_applications table
CREATE TABLE public.onboarding_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  
  -- Application type
  application_type TEXT NOT NULL CHECK (application_type IN ('individual', 'company')),
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'aml_review', 'approved', 'rejected')),
  aml_status TEXT DEFAULT 'pending' CHECK (aml_status IN ('pending', 'passed', 'failed', 'manual_review')),
  
  -- Individual details (if application_type = 'individual')
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  national_insurance_number TEXT,
  
  -- Company details (if application_type = 'company')
  company_name TEXT,
  company_number TEXT,
  incorporation_date DATE,
  vat_number TEXT,
  
  -- Address
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'UK',
  
  -- Document tracking
  id_document_uploaded BOOLEAN DEFAULT false,
  proof_of_address_uploaded BOOLEAN DEFAULT false,
  additional_documents_uploaded BOOLEAN DEFAULT false,
  
  -- AML notes
  aml_notes TEXT,
  rejection_reason TEXT,
  
  -- Client/Company ID after approval
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID
);

-- Create onboarding_documents table for file storage references
CREATE TABLE public.onboarding_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES public.onboarding_applications(id) ON DELETE CASCADE,
  
  document_type TEXT NOT NULL CHECK (document_type IN ('id', 'proof_of_address', 'incorporation_cert', 'other')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.onboarding_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for onboarding_applications
CREATE POLICY "Users can view applications in their organization"
ON public.onboarding_applications FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert applications in their organization"
ON public.onboarding_applications FOR INSERT
WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update applications in their organization"
ON public.onboarding_applications FOR UPDATE
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete applications in their organization"
ON public.onboarding_applications FOR DELETE
USING (user_has_organization_access(organization_id));

-- RLS Policies for onboarding_documents
CREATE POLICY "Users can view documents in their organization"
ON public.onboarding_documents FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert documents in their organization"
ON public.onboarding_documents FOR INSERT
WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update documents in their organization"
ON public.onboarding_documents FOR UPDATE
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete documents in their organization"
ON public.onboarding_documents FOR DELETE
USING (user_has_organization_access(organization_id));

-- Create updated_at trigger for onboarding_applications
CREATE TRIGGER update_onboarding_applications_updated_at
BEFORE UPDATE ON public.onboarding_applications
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Create storage bucket for onboarding documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('onboarding-documents', 'onboarding-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for onboarding documents
CREATE POLICY "Users can upload onboarding documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'onboarding-documents' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view their organization's onboarding documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'onboarding-documents' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can update their organization's onboarding documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'onboarding-documents' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete their organization's onboarding documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'onboarding-documents' 
  AND auth.uid() IS NOT NULL
);