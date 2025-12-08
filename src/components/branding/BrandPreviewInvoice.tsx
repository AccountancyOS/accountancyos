import { FileText } from "lucide-react";

interface BrandPreviewInvoiceProps {
  logoUrl?: string;
  practiceName: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    postcode?: string;
  };
  footerNotes?: string;
  accentColor: string;
}

export const BrandPreviewInvoice = ({
  logoUrl,
  practiceName,
  address,
  footerNotes,
  accentColor,
}: BrandPreviewInvoiceProps) => {
  const formatAddress = () => {
    const parts = [
      address?.line1,
      address?.line2,
      address?.city,
      address?.postcode,
    ].filter(Boolean);
    return parts.join(", ");
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-background shadow-sm">
      {/* Preview Label */}
      <div className="px-3 py-2 border-b bg-muted/50 flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Invoice Preview</span>
      </div>

      {/* Invoice Content */}
      <div className="bg-white p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={practiceName} 
                className="h-10 object-contain mb-2"
              />
            ) : (
              <h2 
                className="text-xl font-bold mb-2"
                style={{ color: accentColor }}
              >
                {practiceName}
              </h2>
            )}
            {address && (
              <p className="text-xs text-gray-500">{formatAddress()}</p>
            )}
          </div>
          <div className="text-right">
            <h1 
              className="text-2xl font-bold"
              style={{ color: accentColor }}
            >
              INVOICE
            </h1>
            <p className="text-xs text-gray-500 mt-1">INV-2024-0001</p>
            <p className="text-xs text-gray-500">Date: {new Date().toLocaleDateString('en-GB')}</p>
          </div>
        </div>

        {/* Bill To */}
        <div className="border-t pt-4">
          <p className="text-xs font-medium text-gray-500 uppercase mb-1">Bill To</p>
          <p className="text-sm font-medium text-gray-800">Sample Client Ltd</p>
          <p className="text-xs text-gray-500">123 Client Street, London, EC1A 1AA</p>
        </div>

        {/* Line Items */}
        <div className="border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr 
                className="text-white text-left"
                style={{ backgroundColor: accentColor }}
              >
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <td className="px-3 py-2 text-gray-700">Annual Accounts Preparation</td>
                <td className="px-3 py-2 text-right text-gray-700">£1,200.00</td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-gray-700">Corporation Tax Return</td>
                <td className="px-3 py-2 text-right text-gray-700">£400.00</td>
              </tr>
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td className="px-3 py-2 font-medium text-gray-700">Total</td>
                <td className="px-3 py-2 text-right font-bold" style={{ color: accentColor }}>£1,600.00</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Footer */}
        {footerNotes && (
          <div className="border-t pt-4">
            <p className="text-xs text-gray-500 whitespace-pre-wrap">{footerNotes}</p>
          </div>
        )}
      </div>
    </div>
  );
};
