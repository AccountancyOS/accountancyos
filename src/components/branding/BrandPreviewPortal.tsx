import { Globe, Home, FileText, MessageSquare, Settings } from "lucide-react";

interface BrandPreviewPortalProps {
  logoUrl?: string;
  practiceName: string;
  accentColor: string;
  portalTheme?: {
    headerStyle?: 'default' | 'minimal';
    buttonStyle?: 'rounded' | 'square';
  };
}

export const BrandPreviewPortal = ({
  logoUrl,
  practiceName,
  accentColor,
  portalTheme,
}: BrandPreviewPortalProps) => {
  const buttonRadius = portalTheme?.buttonStyle === 'square' ? '0' : '6px';

  return (
    <div className="border rounded-lg overflow-hidden bg-background shadow-sm">
      {/* Preview Label */}
      <div className="px-3 py-2 border-b bg-muted/50 flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Client Portal Preview</span>
      </div>

      {/* Portal Content */}
      <div className="bg-gray-100">
        {/* Header */}
        <header 
          className="px-4 py-3 flex items-center justify-between"
          style={{ backgroundColor: accentColor }}
        >
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={practiceName} 
                className="h-7 object-contain"
              />
            ) : (
              <span className="text-white font-semibold">{practiceName}</span>
            )}
          </div>
          <nav className="flex items-center gap-4">
            <a href="#" className="text-white/90 text-xs hover:text-white flex items-center gap-1">
              <Home className="h-3 w-3" />
              Home
            </a>
            <a href="#" className="text-white/90 text-xs hover:text-white flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Documents
            </a>
            <a href="#" className="text-white/90 text-xs hover:text-white flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              Messages
            </a>
          </nav>
        </header>

        {/* Hero Section */}
        <div className="p-6 bg-white m-4 rounded-lg shadow-sm">
          <h1 className="text-lg font-semibold text-gray-800 mb-2">
            Welcome back, John
          </h1>
          <p className="text-sm text-gray-600 mb-4">
            Here's an overview of your account with {practiceName}.
          </p>
          
          {/* Quick Actions */}
          <div className="flex gap-3">
            <button 
              className="px-4 py-2 text-white text-xs font-medium"
              style={{ 
                backgroundColor: accentColor,
                borderRadius: buttonRadius,
              }}
            >
              View Documents
            </button>
            <button 
              className="px-4 py-2 text-xs font-medium border"
              style={{ 
                borderColor: accentColor,
                color: accentColor,
                borderRadius: buttonRadius,
              }}
            >
              Send Message
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="px-4 pb-4 grid grid-cols-3 gap-3">
          <div className="bg-white p-3 rounded-lg shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Outstanding Tasks</p>
            <p className="text-xl font-bold" style={{ color: accentColor }}>3</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Documents</p>
            <p className="text-xl font-bold" style={{ color: accentColor }}>12</p>
          </div>
          <div className="bg-white p-3 rounded-lg shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Messages</p>
            <p className="text-xl font-bold" style={{ color: accentColor }}>2</p>
          </div>
        </div>
      </div>
    </div>
  );
};
