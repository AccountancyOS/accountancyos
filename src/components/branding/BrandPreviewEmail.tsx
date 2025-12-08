import { Mail } from "lucide-react";

interface BrandPreviewEmailProps {
  logoUrl?: string;
  practiceName: string;
  accentColor: string;
  footerHtml?: string;
}

export const BrandPreviewEmail = ({
  logoUrl,
  practiceName,
  accentColor,
  footerHtml,
}: BrandPreviewEmailProps) => {
  return (
    <div className="border rounded-lg overflow-hidden bg-background shadow-sm">
      {/* Email Preview Label */}
      <div className="px-3 py-2 border-b bg-muted/50 flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Email Preview</span>
      </div>

      {/* Email Content */}
      <div className="bg-white">
        {/* Header */}
        <div 
          className="px-6 py-4 border-b"
          style={{ backgroundColor: accentColor }}
        >
          {logoUrl ? (
            <img 
              src={logoUrl} 
              alt={practiceName} 
              className="h-8 object-contain"
            />
          ) : (
            <span className="text-white font-semibold text-lg">{practiceName}</span>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          <p className="text-sm text-gray-800">Dear Client,</p>
          <p className="text-sm text-gray-600">
            Thank you for your recent enquiry. We are pleased to confirm that your request has been processed successfully.
          </p>
          <p className="text-sm text-gray-600">
            If you have any questions, please don't hesitate to get in touch.
          </p>
          <p className="text-sm text-gray-800">
            Kind regards,<br />
            <span className="font-medium">{practiceName}</span>
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50">
          {footerHtml ? (
            <div 
              className="text-xs text-gray-500"
              dangerouslySetInnerHTML={{ __html: footerHtml }}
            />
          ) : (
            <p className="text-xs text-gray-500">
              © {new Date().getFullYear()} {practiceName}. All rights reserved.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
