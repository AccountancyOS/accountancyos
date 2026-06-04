import { supabase } from "@/integrations/supabase/client";

/**
 * Generate a short-lived signed download URL for a private storage object.
 * Returns null on failure so the UI can gracefully disable the download button.
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresInSec = 60 * 15,
): Promise<string | null> {
  if (!bucket || !path) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSec);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}