import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { sanitizeEmailHtml } from "@/lib/sanitizeHtml";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SAMPLE_SUBJECT = "Engagement Letter For Jane Smith";
const SAMPLE_BODY = `<p>Dear Jane Smith,</p>
<p>Thank you for choosing <strong>{{firm_name}}</strong> to act for you. This letter sets out the basis on which we will provide our professional services.</p>
<p>This is a sample engagement letter rendered for preview purposes only. Edit your variants under Settings &rarr; Engagement Letter Variants to change the wording your clients will receive.</p>
<p>Yours sincerely,<br/>{{firm_name}}</p>`;

interface PreviewData {
  subject: string;
  body: string;
  firmName: string;
  isSample: boolean;
}

export default function EngagementLetterPreview() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) return;
      if (token === "sample-token") {
        const firmName = "Your Firm";
        if (!cancelled) {
          setData({
            subject: SAMPLE_SUBJECT,
            body: SAMPLE_BODY.replace(/\{\{firm_name\}\}/g, firmName),
            firmName,
            isSample: true,
          });
          setLoading(false);
        }
        return;
      }
      try {
        const { data: letter, error: lerr } = await supabase
          .from("engagement_letters")
          .select("id, organization_id, document_content, viewed_at")
          .eq("signature_token", token)
          .maybeSingle();
        if (lerr) throw lerr;
        if (!letter) {
          if (!cancelled) {
            setError("This engagement letter link is invalid or has expired.");
            setLoading(false);
          }
          return;
        }
        const { data: org } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", letter.organization_id)
          .maybeSingle();
        if (!cancelled) {
          setData({
            subject: "Engagement Letter",
            body: (letter as any).document_content || "",
            firmName: org?.name || "Your Firm",
            isSample: false,
          });
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || "Unable to load engagement letter.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Engagement Letter Unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {error || "We could not load this engagement letter."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {data.isSample && (
          <Card className="border-amber-500/40 bg-amber-500/10">
            <CardContent className="py-3 text-sm text-amber-900 dark:text-amber-100">
              Preview Mode &mdash; this is a sample engagement letter using placeholder data.
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">From {data.firmName}</p>
            <CardTitle className="text-2xl">{data.subject}</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(data.body) }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}