-- Add AML verified date tracking
ALTER TABLE onboarding_applications 
ADD COLUMN IF NOT EXISTS aml_verified_at TIMESTAMP WITH TIME ZONE;

-- Create a trigger function to auto-update AML status when application is approved
CREATE OR REPLACE FUNCTION public.auto_verify_aml_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When status changes to 'approved', automatically set AML status to 'verified'
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    NEW.aml_status := 'verified';
    NEW.aml_verified_at := NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on onboarding_applications
DROP TRIGGER IF EXISTS trigger_auto_verify_aml ON onboarding_applications;
CREATE TRIGGER trigger_auto_verify_aml
  BEFORE UPDATE ON onboarding_applications
  FOR EACH ROW
  EXECUTE FUNCTION auto_verify_aml_on_approval();