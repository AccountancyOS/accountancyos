import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, X } from "lucide-react";
import { Database } from "@/integrations/supabase/types";

type OrganizationBrandingInsert = Database["public"]["Tables"]["organization_branding"]["Insert"];

interface PracticeProfileStepProps {
  organizationId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export const PracticeProfileStep = ({ organizationId, onComplete, onSkip }: PracticeProfileStepProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    address_line_1: "",
    address_line_2: "",
    city: "",
    postcode: "",
    country: "UK",
  });

  const handleLogoUpload = async (file: File) => {
    if (!organizationId) return;

    // Validate file type (both MIME and extension)
    const allowedMimeTypes = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp'];
    const allowedExtensions = ['png', 'svg', 'jpg', 'jpeg', 'webp'];

    if (!allowedMimeTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Only PNG, SVG, JPG, and WebP images are allowed.",
        variant: "destructive",
      });
      return;
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedExtensions.includes(fileExt)) {
      toast({
        title: "Invalid file extension",
        description: "Only .png, .svg, .jpg, and .webp files are allowed.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Logo must be under 2MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadingLogo(true);
    try {
      const fileName = `logo-light.${fileExt}`;
      const filePath = `${organizationId}/${fileName}`;

      // Delete existing file if any
      await supabase.storage.from("branding").remove([filePath]);

      // Upload new file
      const { error: uploadError } = await supabase.storage
        .from("branding")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("branding")
        .getPublicUrl(filePath);

      setLogoUrl(urlData.publicUrl);
      setLogoPreview(URL.createObjectURL(file));
      toast({
        title: "Logo uploaded",
        description: "Your practice logo has been uploaded.",
      });
    } catch (error: any) {
      toast({
        title: "Error uploading logo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
    setLogoPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Update organizations table
      const { error: orgError } = await supabase
        .from("organizations")
        .update({
          address_line_1: formData.address_line_1,
          address_line_2: formData.address_line_2,
          city: formData.city,
          postcode: formData.postcode,
          country: formData.country,
        })
        .eq("id", organizationId);

      if (orgError) throw orgError;

      // 2. Get org name for prefill
      const { data: orgData } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single();

      // 3. Create/update organization_branding row
      const brandingPayload: OrganizationBrandingInsert = {
        organization_id: organizationId,
        trading_name: orgData?.name || null,
        address_line_1: formData.address_line_1 || null,
        address_line_2: formData.address_line_2 || null,
        city: formData.city || null,
        postcode: formData.postcode || null,
        country: formData.country || "United Kingdom",
        logo_light_url: logoUrl || null,
      };

      const { error: brandingError } = await supabase
        .from("organization_branding")
        .upsert(brandingPayload);

      if (brandingError) throw brandingError;

      toast({
        title: "Profile updated",
        description: "Your practice profile has been saved.",
      });

      onComplete();
    } catch (error: any) {
      toast({
        title: "Error updating profile",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Practice Logo (Optional)</Label>
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            {logoPreview ? (
              <div className="space-y-3">
                <img
                  src={logoPreview}
                  alt="Practice logo"
                  className="h-16 mx-auto object-contain"
                />
                <div className="flex justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById("logo-input")?.click()}
                    disabled={uploadingLogo}
                  >
                    {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Replace"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveLogo}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <label className="cursor-pointer block">
                {uploadingLogo ? (
                  <Loader2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground animate-spin" />
                ) : (
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                )}
                <p className="text-sm text-muted-foreground">
                  {uploadingLogo ? "Uploading..." : "Click to upload your practice logo"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG or SVG, max 2MB
                </p>
              </label>
            )}
            <input
              id="logo-input"
              type="file"
              accept="image/png,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoUpload(file);
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address_line_1">Address Line 1</Label>
            <Input
              id="address_line_1"
              value={formData.address_line_1}
              onChange={(e) => setFormData({ ...formData, address_line_1: e.target.value })}
              placeholder="123 High Street"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="address_line_2">Address Line 2 (Optional)</Label>
            <Input
              id="address_line_2"
              value={formData.address_line_2}
              onChange={(e) => setFormData({ ...formData, address_line_2: e.target.value })}
              placeholder="Suite 100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="London"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="postcode">Postcode</Label>
            <Input
              id="postcode"
              value={formData.postcode}
              onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
              placeholder="SW1A 1AA"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save & Continue"
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onSkip}>
          Skip for Now
        </Button>
      </div>
    </form>
  );
};
