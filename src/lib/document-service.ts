// Document upload and download service for job documents
import { supabase } from "@/integrations/supabase/client";

const STORAGE_BUCKET = "job-documents";

// Maximum file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Allowed MIME types for document uploads
const ALLOWED_MIME_TYPES = [
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

// Allowed file extensions
const ALLOWED_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt",
  "jpg", "jpeg", "png", "gif", "webp"
];

export interface UploadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface DocumentMetadata {
  jobId: string;
  organizationId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  clientVisible?: boolean;
  signatureRequired?: boolean;
}

/**
 * Upload a file to job documents storage
 */
export async function uploadJobDocument(
  file: File,
  metadata: DocumentMetadata
): Promise<UploadResult> {
  try {
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: "File too large (max 50MB)" };
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return { success: false, error: "File type not allowed" };
    }

    // Validate file extension
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return { success: false, error: "File extension not allowed" };
    }

    // Generate unique file path: org_id/job_id/timestamp_filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${metadata.organizationId}/${metadata.jobId}/${timestamp}_${sanitizedName}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return { success: false, error: uploadError.message };
    }

    // Create job_documents record
    const { error: dbError } = await supabase.from("job_documents").insert({
      job_id: metadata.jobId,
      organization_id: metadata.organizationId,
      file_name: metadata.fileName,
      file_path: filePath,
      file_size: metadata.fileSize,
      mime_type: metadata.mimeType,
      client_visible: metadata.clientVisible ?? false,
      signature_required: metadata.signatureRequired ?? false,
      uploaded_at: new Date().toISOString(),
    });

    if (dbError) {
      // Rollback storage upload on DB failure
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      console.error("DB insert error:", dbError);
      return { success: false, error: dbError.message };
    }

    return { success: true, filePath };
  } catch (error: any) {
    console.error("Upload exception:", error);
    return { success: false, error: error.message || "Upload failed" };
  }
}

/**
 * Get a signed download URL for a document
 */
export async function getDocumentDownloadUrl(
  filePath: string,
  expiresIn: number = 3600
): Promise<{ url: string | null; error: string | null }> {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      console.error("Signed URL error:", error);
      return { url: null, error: error.message };
    }

    return { url: data.signedUrl, error: null };
  } catch (error: any) {
    console.error("Download URL exception:", error);
    return { url: null, error: error.message || "Failed to generate download URL" };
  }
}

/**
 * Download a document directly (triggers browser download)
 */
export async function downloadDocument(
  filePath: string,
  fileName: string
): Promise<{ success: boolean; error?: string }> {
  const { url, error } = await getDocumentDownloadUrl(filePath);

  if (error || !url) {
    return { success: false, error: error || "Failed to get download URL" };
  }

  // Trigger browser download
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);

    return { success: true };
  } catch (err: any) {
    console.error("Download error:", err);
    return { success: false, error: err.message || "Download failed" };
  }
}

/**
 * Delete a document from storage and database
 */
export async function deleteJobDocument(
  documentId: string,
  filePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete from storage first
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);

    if (storageError) {
      console.error("Storage delete error:", storageError);
      // Continue to delete DB record even if storage fails
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from("job_documents")
      .delete()
      .eq("id", documentId);

    if (dbError) {
      return { success: false, error: dbError.message };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || "Delete failed" };
  }
}
