import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { OrganizationProvider } from "@/lib/organization-context";
import { PortalProvider } from "@/lib/portal-context";
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
import PlaceholderPage from "./pages/PlaceholderPage";
import NotFound from "./pages/NotFound";
import Templates from "./pages/Templates";
import TemplateDetail from "./pages/TemplateDetail";
import QuestionnaireResponse from "./pages/QuestionnaireResponse";
import PortalAuth from "./pages/portal/Auth";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
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

const PortalRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/portal/auth" replace />;
  }

  return <PortalProvider>{children}</PortalProvider>;
};

const App = () => (
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
                  <PlaceholderPage
                    title="Bookkeeping"
                    description="Full double-entry ledger with P&L and Balance Sheet"
                  />
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
                  <PlaceholderPage
                    title="Deadlines"
                    description="Track all statutory and internal deadlines"
                  />
                </ProtectedRoute>
              }
            />
            <Route
              path="/filings"
              element={
                <ProtectedRoute>
                  <PlaceholderPage
                    title="Filings"
                    description="HMRC and Companies House submissions"
                  />
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
            
            <Route path="/portal/auth" element={<PortalAuth />} />
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
                  <PlaceholderPage
                    title="Settings"
                    description="Organization settings and preferences"
                  />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
