import { format } from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { EmailJobTagger } from "./EmailJobTagger";
import { Mail, ArrowRight, ArrowLeft, Paperclip, User, Building2 } from "lucide-react";

interface EmailViewerProps {
  email: {
    id: string;
    subject: string | null;
    from_email: string;
    from_name: string | null;
    to_emails: string[] | null;
    cc_emails: string[] | null;
    body_html: string | null;
    body_text: string | null;
    sent_at: string | null;
    received_at: string | null;
    direction: string;
    is_read: boolean | null;
    labels: string[] | null;
    attachments: any;
    client_id: string | null;
    company_id: string | null;
    job_id: string | null;
  };
  clientName?: string;
  companyName?: string;
  onUpdated?: () => void;
}

export function EmailViewer({ email, clientName, companyName, onUpdated }: EmailViewerProps) {
  const timestamp = email.direction === "outbound" ? email.sent_at : email.received_at;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              {email.direction === "inbound" ? (
                <ArrowLeft className="h-4 w-4 text-blue-500" />
              ) : (
                <ArrowRight className="h-4 w-4 text-green-500" />
              )}
              <h3 className="font-semibold text-lg">{email.subject || "(No subject)"}</h3>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                <strong>From:</strong> {email.from_name || email.from_email}
                {email.from_name && ` <${email.from_email}>`}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                <strong>To:</strong> {email.to_emails?.join(", ") || "—"}
              </span>
            </div>
            {email.cc_emails && email.cc_emails.length > 0 && (
              <div className="text-sm text-muted-foreground">
                <strong>Cc:</strong> {email.cc_emails.join(", ")}
              </div>
            )}
          </div>
          <div className="text-right space-y-1">
            <p className="text-sm text-muted-foreground">
              {timestamp ? format(new Date(timestamp), "dd MMM yyyy, HH:mm") : "—"}
            </p>
            <div className="flex gap-1 justify-end flex-wrap">
              <Badge variant={email.direction === "inbound" ? "default" : "secondary"}>
                {email.direction === "inbound" ? "Received" : "Sent"}
              </Badge>
              {!email.is_read && email.direction === "inbound" && (
                <Badge variant="destructive">Unread</Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <Separator />

      {/* Linked entities */}
      <div className="px-6 py-3 bg-muted/30 flex items-center gap-6 flex-wrap">
        {clientName && (
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{clientName}</span>
          </div>
        )}
        {companyName && (
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span>{companyName}</span>
          </div>
        )}
        <EmailJobTagger
          emailId={email.id}
          clientId={email.client_id}
          companyId={email.company_id}
          currentJobId={email.job_id}
          emailSubject={email.subject}
          onTagged={onUpdated}
        />
      </div>

      <Separator />

      {/* Attachments */}
      {email.attachments && Array.isArray(email.attachments) && email.attachments.length > 0 && (
        <>
          <div className="px-6 py-2 bg-muted/20">
            <div className="flex items-center gap-2 text-sm">
              <Paperclip className="h-4 w-4" />
              <span className="font-medium">Attachments:</span>
              {email.attachments.map((att: any, i: number) => (
                <Badge key={i} variant="outline">
                  {att.filename || `Attachment ${i + 1}`}
                </Badge>
              ))}
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Body */}
      <CardContent className="pt-4">
        {email.body_html ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: email.body_html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap text-sm font-sans">
            {email.body_text || "(No content)"}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
