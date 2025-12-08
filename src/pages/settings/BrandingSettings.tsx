import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Upload, Loader2, Palette, Image, Mail, FileText, Globe, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { toast } from "sonner";
import { BrandPreviewEmail } from "@/components/branding/BrandPreviewEmail";
import { BrandPreviewInvoice } from "@/components/branding/BrandPreviewInvoice";
import { BrandPreviewPortal } from "@/components/branding/BrandPreviewPortal";

interface BrandingData {
  trading_name: string;
  legal_name: string;
  phone: string;
  website: string;
  vat_number: string;
  company_registration_number: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  postcode: string;
  country: string;
  logo_light_url: string;
  logo_dark_url: string;
  accent_color: string;
  invoice_footer_notes: string;
  email_footer_html: string;
  portal_theme: Record<string, unknown>;
}

const defaultBranding: BrandingData = {
  trading_name: "",
  legal_name: "",
  phone: "",
  website: "",
  vat_number: "",
  company_registration_number: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  postcode: "",
  country: "United Kingdom",
  logo_light_url: "",
  logo_dark_url: "",
  accent_color: "#3b82f6",
  invoice_footer_notes: "",
  email_footer_html: "",
  portal_theme: {},
};

export default function BrandingSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organization } = useOrganization();
  const [branding, setBranding] = useState<BrandingData>(defaultBranding);
  const [isDirty, setIsDirty] = useState(false);
  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);

  // Fetch branding data
  const { data: brandingData, isLoading } = useQuery({
    queryKey: ["organization-branding", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;

      const { data, error } = await supabase
        .from("organization_branding")
        .select("*")
        .eq("organization_id", organization.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  // Fetch organization for prefill
  const { data: orgData } = useQuery({
    queryKey: ["organization-details", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return null;

      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", organization.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  // Initialize branding from fetched data or org prefill
  useEffect(() => {
    if (brandingData) {
      setBranding({
        trading_name: brandingData.trading_name || "",
        legal_name: brandingData.legal_name || "",
        phone: brandingData.phone || "",
        website: brandingData.website || "",
        vat_number: brandingData.vat_number || "",
        company_registration_number: brandingData.company_registration_number || "",
        address_line_1: brandingData.address_line_1 || "",
        address_line_2: brandingData.address_line_2 || "",
        city: brandingData.city || "",
        postcode: brandingData.postcode || "",
        country: brandingData.country || "United Kingdom",
        logo_light_url: brandingData.logo_light_url || "",
        logo_dark_url: brandingData.logo_dark_url || "",
        accent_color: brandingData.accent_color || "#3b82f6",
        invoice_footer_notes: brandingData.invoice_footer_notes || "",
        email_footer_html: brandingData.email_footer_html || "",
        portal_theme: (brandingData.portal_theme as Record<string, unknown>) || {},
      });
    } else if (orgData && !brandingData) {
      // Prefill from organization if no branding exists
      setBranding({
        ...defaultBranding,
        trading_name: orgData.name || "",
        address_line_1: orgData.address_line_1 || "",
        address_line_2: orgData.address_line_2 || "",
        city: orgData.city || "",
        postcode: orgData.postcode || "",
        country: orgData.country || "United Kingdom",
      });
    }
  }, [brandingData, orgData]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: BrandingData) => {
      if (!organization?.id) throw new Error("No organization");

      const { error } = await supabase
        .from("organization_branding")
        .upsert({
          organization_id: organization.id,
          trading_name: data.trading_name,
          legal_name: data.legal_name,
          phone: data.phone,
          website: data.website,
          vat_number: data.vat_number,
          company_registration_number: data.company_registration_number,
          address_line_1: data.address_line_1,
          address_line_2: data.address_line_2,
          city: data.city,
          postcode: data.postcode,
          country: data.country,
          logo_light_url: data.logo_light_url,
          logo_dark_url: data.logo_dark_url,
          accent_color: data.accent_color,
          invoice_footer_notes: data.invoice_footer_notes,
          email_footer_html: data.email_footer_html,
          portal_theme: data.portal_theme,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Branding saved successfully");
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["organization-branding"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  const updateField = useCallback((field: keyof BrandingData, value: string) => {
    setBranding(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  const handleLogoUpload = async (file: File, type: "light" | "dark") => {
    if (!organization?.id) return;

    const setter = type === "light" ? setUploadingLight : setUploadingDark;
    setter(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${type}.${fileExt}`;
      const filePath = `${organization.id}/${fileName}`;

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

      const fieldName = type === "light" ? "logo_light_url" : "logo_dark_url";
      updateField(fieldName, urlData.publicUrl);
      toast.success(`${type === "light" ? "Light" : "Dark"} logo uploaded`);
    } catch (error: any) {
      toast.error(`Failed to upload: ${error.message}`);
    } finally {
      setter(false);
    }
  };

  const handleSave = () => {
    saveMutation.mutate(branding);
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Branding</h1>
              <p className="text-muted-foreground">
                Customize your practice's visual identity
              </p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={!isDirty || saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>

        <Separator />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Form */}
          <div className="space-y-6">
            {/* Practice Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Practice Details
                </CardTitle>
                <CardDescription>
                  Basic information about your practice
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="trading_name">Trading Name</Label>
                    <Input
                      id="trading_name"
                      value={branding.trading_name}
                      onChange={(e) => updateField("trading_name", e.target.value)}
                      placeholder="My Accountancy Practice"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legal_name">Legal Name</Label>
                    <Input
                      id="legal_name"
                      value={branding.legal_name}
                      onChange={(e) => updateField("legal_name", e.target.value)}
                      placeholder="My Practice Ltd"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={branding.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      placeholder="+44 123 456 7890"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={branding.website}
                      onChange={(e) => updateField("website", e.target.value)}
                      placeholder="https://mypractice.com"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vat_number">VAT Number</Label>
                    <Input
                      id="vat_number"
                      value={branding.vat_number}
                      onChange={(e) => updateField("vat_number", e.target.value)}
                      placeholder="GB123456789"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company_registration_number">Company Reg. No.</Label>
                    <Input
                      id="company_registration_number"
                      value={branding.company_registration_number}
                      onChange={(e) => updateField("company_registration_number", e.target.value)}
                      placeholder="12345678"
                    />
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="address_line_1">Address Line 1</Label>
                  <Input
                    id="address_line_1"
                    value={branding.address_line_1}
                    onChange={(e) => updateField("address_line_1", e.target.value)}
                    placeholder="123 High Street"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_line_2">Address Line 2</Label>
                  <Input
                    id="address_line_2"
                    value={branding.address_line_2}
                    onChange={(e) => updateField("address_line_2", e.target.value)}
                    placeholder="Suite 100"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={branding.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      placeholder="London"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postcode">Postcode</Label>
                    <Input
                      id="postcode"
                      value={branding.postcode}
                      onChange={(e) => updateField("postcode", e.target.value)}
                      placeholder="SW1A 1AA"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={branding.country}
                      onChange={(e) => updateField("country", e.target.value)}
                      placeholder="United Kingdom"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Logo Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Logo
                </CardTitle>
                <CardDescription>
                  Upload your practice logo (PNG or SVG, max 2MB)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Light Logo */}
                  <div className="space-y-2">
                    <Label>Light Logo</Label>
                    <div className="border-2 border-dashed rounded-lg p-4 text-center">
                      {branding.logo_light_url ? (
                        <div className="space-y-2">
                          <img
                            src={branding.logo_light_url}
                            alt="Light logo"
                            className="h-12 mx-auto object-contain"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById("logo-light-input")?.click()}
                            disabled={uploadingLight}
                          >
                            {uploadingLight ? <Loader2 className="h-4 w-4 animate-spin" /> : "Replace"}
                          </Button>
                        </div>
                      ) : (
                        <label className="cursor-pointer block">
                          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {uploadingLight ? "Uploading..." : "Click to upload"}
                          </span>
                        </label>
                      )}
                      <input
                        id="logo-light-input"
                        type="file"
                        accept="image/png,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLogoUpload(file, "light");
                        }}
                      />
                    </div>
                  </div>

                  {/* Dark Logo */}
                  <div className="space-y-2">
                    <Label>Dark Logo (Optional)</Label>
                    <div className="border-2 border-dashed rounded-lg p-4 text-center bg-slate-900">
                      {branding.logo_dark_url ? (
                        <div className="space-y-2">
                          <img
                            src={branding.logo_dark_url}
                            alt="Dark logo"
                            className="h-12 mx-auto object-contain"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById("logo-dark-input")?.click()}
                            disabled={uploadingDark}
                          >
                            {uploadingDark ? <Loader2 className="h-4 w-4 animate-spin" /> : "Replace"}
                          </Button>
                        </div>
                      ) : (
                        <label className="cursor-pointer block">
                          <Upload className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                          <span className="text-sm text-slate-400">
                            {uploadingDark ? "Uploading..." : "Click to upload"}
                          </span>
                        </label>
                      )}
                      <input
                        id="logo-dark-input"
                        type="file"
                        accept="image/png,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleLogoUpload(file, "dark");
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Colors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Colors
                </CardTitle>
                <CardDescription>
                  Choose your brand accent color
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="accent_color">Accent Color</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        id="accent_color"
                        value={branding.accent_color}
                        onChange={(e) => updateField("accent_color", e.target.value)}
                        className="h-10 w-14 rounded border cursor-pointer"
                      />
                      <Input
                        value={branding.accent_color}
                        onChange={(e) => updateField("accent_color", e.target.value)}
                        placeholder="#3b82f6"
                        className="w-28"
                      />
                    </div>
                  </div>
                  <div
                    className="h-10 w-32 rounded-md flex items-center justify-center text-white text-sm font-medium"
                    style={{ backgroundColor: branding.accent_color }}
                  >
                    Preview
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email Footer */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Footer
                </CardTitle>
                <CardDescription>
                  HTML content for email footers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={branding.email_footer_html}
                  onChange={(e) => updateField("email_footer_html", e.target.value)}
                  placeholder="<p>© 2024 My Practice. All rights reserved.</p>"
                  rows={4}
                  className="font-mono text-sm"
                />
              </CardContent>
            </Card>

            {/* Invoice Footer */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Invoice Footer
                </CardTitle>
                <CardDescription>
                  Notes to appear on invoice footers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={branding.invoice_footer_notes}
                  onChange={(e) => updateField("invoice_footer_notes", e.target.value)}
                  placeholder="Payment terms: 14 days from invoice date.&#10;Bank: Sample Bank, Sort: 12-34-56, Account: 12345678"
                  rows={4}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Previews */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Live Preview
                </CardTitle>
                <CardDescription>
                  See how your branding will appear
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="email" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="email">Email</TabsTrigger>
                    <TabsTrigger value="invoice">Invoice</TabsTrigger>
                    <TabsTrigger value="portal">Portal</TabsTrigger>
                  </TabsList>
                  <TabsContent value="email" className="mt-4">
                    <BrandPreviewEmail
                      logoUrl={branding.logo_light_url}
                      practiceName={branding.trading_name || branding.legal_name || "Your Practice"}
                      accentColor={branding.accent_color}
                      footerHtml={branding.email_footer_html}
                    />
                  </TabsContent>
                  <TabsContent value="invoice" className="mt-4">
                    <BrandPreviewInvoice
                      logoUrl={branding.logo_light_url}
                      practiceName={branding.trading_name || branding.legal_name || "Your Practice"}
                      address={{
                        line1: branding.address_line_1,
                        line2: branding.address_line_2,
                        city: branding.city,
                        postcode: branding.postcode,
                      }}
                      footerNotes={branding.invoice_footer_notes}
                      accentColor={branding.accent_color}
                    />
                  </TabsContent>
                  <TabsContent value="portal" className="mt-4">
                    <BrandPreviewPortal
                      logoUrl={branding.logo_light_url}
                      practiceName={branding.trading_name || branding.legal_name || "Your Practice"}
                      accentColor={branding.accent_color}
                      portalTheme={branding.portal_theme as { headerStyle?: 'default' | 'minimal'; buttonStyle?: 'rounded' | 'square' }}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
