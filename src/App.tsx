import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { AppProvider } from "@/lib/app-context";
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
import OnboardingDiagnostics from "./pages/OnboardingDiagnostics";
import Subscription from "./pages/Subscription";
import ColorComparison from "./pages/ColorComparison";
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
import SystemSpecification from "./pages/SystemSpecification";
import BrandingSettings from "./pages/settings/BrandingSettings";
import HMRCSettings from "./pages/settings/HMRCSettings";
import CompaniesHouseSettings from "./pages/settings/CompaniesHouseSettings";
import PermissionsSettings from "./pages/settings/PermissionsSettings";
import EmailTemplates from "./pages/settings/EmailTemplates";
import AutomationSettingsCentre from "./pages/settings/AutomationSettingsCentre";
import EmailPreferencesPage from "./pages/settings/EmailPreferencesPage";
import CompaniesHouseDiffInbox from "./pages/settings/CompaniesHouseDiffInbox";
import EngagementLetterVariants from "./pages/settings/EngagementLetterVariants";
import MyProfileSettings from "./pages/settings/MyProfileSettings";
import CrmFollowupSequences from "./pages/settings/CrmFollowupSequences";
import EngagementLetterPreview from "./pages/EngagementLetterPreview";
import CompletePayment from "./pages/CompletePayment";
import ConfirmEmail from "./pages/ConfirmEmail";
import PublicQuoteView from "./pages/PublicQuoteView";
import PublicOnboarding from "./pages/PublicOnboarding";
import OAuthConsent from "./pages/OAuthConsent";
import { Loader2 } from "lucide-react";
import PortalRoutes from "./portal/routes/PortalRoutes";
import { PortalGuard } from "./portal/guards/PortalGuard";
import { PortalLayout } from "./portal/layouts/PortalLayout";
import PortalLogin from "./portal/pages/PortalLogin";
import PortalInvite from "./portal/pages/PortalInvite";
import PortalForgotPassword from "./portal/pages/PortalForgotPassword";
import PortalResetPassword from "./portal/pages/PortalResetPassword";
import PortalDashboard from "./portal/pages/PortalDashboard";
import PortalTasks from "./portal/pages/PortalTasks";
import PortalDocuments from "./portal/pages/PortalDocuments";
import PortalQuestionnaires from "./portal/pages/PortalQuestionnaires";
import PortalQuestionnaireResponse from "./portal/pages/PortalQuestionnaireResponse";
import PortalMessages from "./portal/pages/PortalMessages";
import PortalPayments from "./portal/pages/PortalPayments";
import PortalBookkeeping from "./portal/pages/PortalBookkeeping";
import PortalSettings from "./portal/pages/PortalSettings";
import { isClientPortalDomain, portalPath } from "./portal/utils/portalPaths";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data considered fresh for 5 minutes
      gcTime: 1000 * 60 * 30, // Cache kept for 30 minutes
      refetchOnWindowFocus: false, // Don't refetch when user switches tabs
      refetchOnReconnect: true, // Do refetch when connection restored
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
    },
  },
});

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  const { data: isAccountantUser, isLoading: checkingMembership } = useQuery({
    queryKey: ["accountant-membership", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_users")
        .select("organization_id")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("[ProtectedRoute] membership check failed", error);
        return true; // fail-open: don't trap accountants if the check errors
      }
      return !!data;
    },
  });

  if (loading || (user && checkingMembership)) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={isClientPortalDomain() ? portalPath("login") : "/auth"} replace />;
  }

  // Portal users (no organization_users row) belong in /portal/*.
  // Allow the accountant-only /portal/preview/* route through so staff
  // can still preview the client view.
  const isPortalPreview = location.pathname.startsWith("/portal/preview/");
  if (isAccountantUser === false && !isPortalPreview) {
    return <Navigate to={portalPath("dashboard")} replace />;
  }

  return <AppProvider>{children}</AppProvider>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, authFlow } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't redirect if user is in password recovery mode
  if (user && authFlow !== "recovery") {
    // Preserve `?next=<same-origin path>` (e.g. OAuth consent) so signed-in
    // users returning to /auth land back at the intended target.
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return <Navigate to={safe} replace />;
  }

  return <>{children}</>;
};

const App = () => (
  <ErrorBoundary>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
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
              path="/confirm-email"
              element={<ConfirmEmail />}
            />
            <Route path="/q/:token" element={<PublicQuoteView />} />
            <Route path="/onboard/:applicationId" element={<PublicOnboarding />} />
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
              path="/complete-payment"
              element={
                <ProtectedRoute>
                  <CompletePayment />
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
              path="/onboarding/diagnostics"
              element={
                <ProtectedRoute>
                  <OnboardingDiagnostics />
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
              path="/settings/automations"
              element={
                <ProtectedRoute>
                  <AutomationSettingsCentre />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/email-preferences"
              element={
                <ProtectedRoute>
                  <EmailPreferencesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/companies-house/diffs"
              element={
                <ProtectedRoute>
                  <CompaniesHouseDiffInbox />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/engagement-letters"
              element={
                <ProtectedRoute>
                  <EngagementLetterVariants />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/email-templates"
              element={
                <ProtectedRoute>
                  <EmailTemplates />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/my-profile"
              element={
                <ProtectedRoute>
                  <MyProfileSettings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/crm-sequences"
              element={
                <ProtectedRoute>
                  <CrmFollowupSequences />
                </ProtectedRoute>
              }
            />
            <Route path="/engagement/:token" element={<EngagementLetterPreview />} />
            {/* Client Portal — isolated under src/portal/, mounted at /portal/*.
                Note: /portal/preview/:entityType/:entityId above is the accountant
                preview surface and remains owned by the accountant app. */}
            <Route path="/portal/*" element={<PortalRoutes />} />

            {/* Client portal custom domain aliases, e.g. client.accountancyos.com/banking. */}
            <Route path="/login" element={<PortalLogin />} />
            <Route path="/invite" element={<PortalInvite />} />
            <Route path="/forgot-password" element={<PortalForgotPassword />} />
            <Route path="/reset-password" element={<PortalResetPassword />} />
            <Route element={<PortalGuard />}>
              <Route element={<PortalLayout />}>
                <Route path="/dashboard" element={<PortalDashboard />} />
                <Route path="/tasks" element={<PortalTasks />} />
                <Route path="/documents" element={<PortalDocuments />} />
                <Route path="/questionnaires" element={<PortalQuestionnaires />} />
                <Route path="/questionnaires/:id" element={<PortalQuestionnaireResponse />} />
                <Route path="/messages" element={<PortalMessages />} />
                <Route path="/payments" element={<PortalPayments />} />
                <Route path="/banking" element={<PortalBookkeeping />} />
                <Route path="/profile" element={<PortalSettings />} />
              </Route>
            </Route>
            <Route
              path="/ops/health"
              element={
                <ProtectedRoute>
                  <OpsHealth />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ops/system-specification"
              element={
                <ProtectedRoute>
                  <SystemSpecification />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
