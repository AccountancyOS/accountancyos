import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { OrganizationProvider } from "@/lib/organization-context";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import Auth from "./pages/Auth";
import Overview from "./pages/Overview";
import Index from "./pages/Index";
import WelcomeDashboard from "./pages/WelcomeDashboard";
import CRM from "./pages/CRM";
import Clients from "./pages/Clients";
import ClientPortal from "./pages/ClientPortal";
import Services from "./pages/Services";
import Quotes from "./pages/Quotes";
import QuoteDetail from "./pages/QuoteDetail";
import Onboarding from "./pages/Onboarding";
import OnboardingDetail from "./pages/OnboardingDetail";
import OnboardingWizard from "./pages/OnboardingWizard";
import Subscription from "./pages/Subscription";
import ColorComparison from "./pages/ColorComparison";
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";
import Templates from "./pages/Templates";
import TemplateDetail from "./pages/TemplateDetail";
import QuestionnaireResponse from "./pages/QuestionnaireResponse";
import PortalPreview from "./pages/portal/Preview";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Deadlines from "./pages/Deadlines";
import Filings from "./pages/Filings";
import FilingDetail from "./pages/FilingDetail";
import Workpapers from "./pages/Workpapers";
import Bookkeeping from "./pages/Bookkeeping";
import CompanyDetail from "./pages/CompanyDetail";
import Settings from "./pages/Settings";
import Emails from "./pages/Emails";
import GmailCallback from "./pages/GmailCallback";
import OutlookCallback from "./pages/OutlookCallback";
import Payroll from "./pages/Payroll";
import PayRunDetail from "./pages/PayRunDetail";
import EmployeeDetail from "./pages/EmployeeDetail";
import CIS from "./pages/CIS";
import CISReturnDetail from "./pages/CISReturnDetail";
import JobTemplates from "./pages/JobTemplates";
import Automations from "./pages/Automations";
import OpsHealth from "./pages/OpsHealth";
import BrandingSettings from "./pages/settings/BrandingSettings";
import HMRCSettings from "./pages/settings/HMRCSettings";
import CompaniesHouseSettings from "./pages/settings/CompaniesHouseSettings";
import PermissionsSettings from "./pages/settings/PermissionsSettings";
import EmailTemplates from "./pages/settings/EmailTemplates";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <OrganizationProvider>{children}</OrganizationProvider>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
          <Routes>
            <Route
              path="/auth"
              element={
                <PublicRoute>
                  <Auth />
                </PublicRoute>
              }
            />
            <Route
              path="/color-comparison"
              element={<ColorComparison />}
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/welcome"
              element={
                <ProtectedRoute>
                  <WelcomeDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/overview"
              element={
                <ProtectedRoute>
                  <Overview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/crm"
              element={
                <ProtectedRoute>
                  <CRM />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clients"
              element={
                <ProtectedRoute>
                  <Clients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clients/:clientId"
              element={
                <ProtectedRoute>
                  <ClientPortal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/companies/:companyId"
              element={
                <ProtectedRoute>
                  <CompanyDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/services"
              element={
                <ProtectedRoute>
                  <Services />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotes"
              element={
                <ProtectedRoute>
                  <Quotes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/quotes/:id"
              element={
                <ProtectedRoute>
                  <QuoteDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/onboarding/:id"
              element={
                <ProtectedRoute>
                  <OnboardingDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/onboarding-wizard"
              element={
                <ProtectedRoute>
                  <OnboardingWizard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bookkeeping"
              element={
                <ProtectedRoute>
                  <Bookkeeping />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jobs"
              element={
                <ProtectedRoute>
                  <Jobs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jobs/:jobId"
              element={
                <ProtectedRoute>
                  <JobDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/deadlines"
              element={
                <ProtectedRoute>
                  <Deadlines />
                </ProtectedRoute>
              }
            />
            <Route
              path="/filings"
              element={
                <ProtectedRoute>
                  <Filings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/filings/:filingId"
              element={
                <ProtectedRoute>
                  <FilingDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/workpapers"
              element={
                <ProtectedRoute>
                  <Workpapers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/templates"
              element={
                <ProtectedRoute>
                  <Templates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/templates/:id"
              element={
                <ProtectedRoute>
                  <TemplateDetail />
                </ProtectedRoute>
              }
            />
            
            {/* Questionnaire public response route - no auth required */}
            <Route path="/questionnaire/:instanceId" element={<QuestionnaireResponse />} />
            
            {/* Accountant preview route - for previewing what clients see */}
            <Route
              path="/portal/preview/:entityType/:entityId"
              element={
                <ProtectedRoute>
                  <PortalPreview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/subscription"
              element={
                <ProtectedRoute>
                  <Subscription />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/emails"
              element={
                <ProtectedRoute>
                  <Emails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/auth/gmail/callback"
              element={
                <ProtectedRoute>
                  <GmailCallback />
                </ProtectedRoute>
              }
            />
            <Route
              path="/auth/outlook/callback"
              element={
                <ProtectedRoute>
                  <OutlookCallback />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payroll"
              element={
                <ProtectedRoute>
                  <Payroll />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payroll/pay-runs/:payRunId"
              element={
                <ProtectedRoute>
                  <PayRunDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/payroll/employees/:employeeId"
              element={
                <ProtectedRoute>
                  <EmployeeDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cis"
              element={
                <ProtectedRoute>
                  <CIS />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cis/returns/:cisReturnId"
              element={
                <ProtectedRoute>
                  <CISReturnDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/job-templates"
              element={
                <ProtectedRoute>
                  <JobTemplates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/automations"
              element={
                <ProtectedRoute>
                  <Automations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/branding"
              element={
                <ProtectedRoute>
                  <BrandingSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/hmrc"
              element={
                <ProtectedRoute>
                  <HMRCSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/companies-house"
              element={
                <ProtectedRoute>
                  <CompaniesHouseSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/permissions"
              element={
                <ProtectedRoute>
                  <PermissionsSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ops/health"
              element={
                <ProtectedRoute>
                  <OpsHealth />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
