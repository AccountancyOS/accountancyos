import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { sanitizeFooterHtml } from "@/lib/sanitizeHtml";

export default function MyProfileSettings() {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!organization?.id) return;
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from("organization_users")
        .select("email_signature")
        .eq("organization_id", organization.id)
        .eq("user_id", userId)
        .maybeSingle();
      setSignature((data as any)?.email_signature ?? "");
      setLoading(false);
    })();
  }, [organization?.id]);

  const handleSave = async () => {
    if (!organization?.id) return;
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    const { error } = await supabase
      .from("organization_users")
      .update({ email_signature: signature } as any)
      .eq("organization_id", organization.id)
      .eq("user_id", userId!);
    setSaving(false);
    if (error) {
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Signature Saved", description: "Your email signature has been updated." });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">My Profile</h1>
        <p className="text-muted-foreground">Personal settings applied to your outgoing emails.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email Signature</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signature">Signature (HTML supported)</Label>
            <Textarea
              id="signature"
              rows={10}
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={"<p>Kind regards,<br/>Jane Smith<br/>Partner, Greenfield &amp; Co</p>"}
              disabled={loading}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Automatically appended to engagement letters and outbound system emails sent by you.
            </p>
          </div>

          {signature && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div
                className="rounded-md border bg-muted/30 p-4 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: sanitizeFooterHtml(signature) }}
              />
            </div>
          )}

          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Signature"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}