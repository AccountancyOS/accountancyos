import { Navigate, Route, Routes } from "react-router-dom";
import { PortalGuard } from "../guards/PortalGuard";
import { PortalLayout } from "../layouts/PortalLayout";
import PortalLogin from "../pages/PortalLogin";
import PortalInvite from "../pages/PortalInvite";
import PortalForgotPassword from "../pages/PortalForgotPassword";
import PortalResetPassword from "../pages/PortalResetPassword";
import PortalDashboard from "../pages/PortalDashboard";
import PortalTasks from "../pages/PortalTasks";
import PortalDocuments from "../pages/PortalDocuments";
import PortalQuestionnaires from "../pages/PortalQuestionnaires";
import PortalQuestionnaireResponse from "../pages/PortalQuestionnaireResponse";
import PortalMessages from "../pages/PortalMessages";
import PortalPayments from "../pages/PortalPayments";
import PortalBookkeeping from "../pages/PortalBookkeeping";
import PortalSettings from "../pages/PortalSettings";
import PortalNotFound from "../pages/PortalNotFound";

/**
 * PortalRoutes
 *
 * Mounted in src/App.tsx at <Route path="/portal/*" />.
 *
 * /portal/login and /portal/invite are public.
 * Every other route is wrapped in <PortalGuard> + <PortalLayout>.
 *
 * Note: the accountant app already exposes /portal/preview/:entityType/:entityId.
 * React Router v6 prefers the more specific static route, so that path keeps
 * resolving to the accountant-side preview and is not shadowed here.
 */
export default function PortalRoutes() {
  return (
    <Routes>
      <Route path="login" element={<PortalLogin />} />
      <Route path="invite" element={<PortalInvite />} />
      <Route path="forgot-password" element={<PortalForgotPassword />} />
      <Route path="reset-password" element={<PortalResetPassword />} />

      <Route element={<PortalGuard />}>
        <Route element={<PortalLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<PortalDashboard />} />
          <Route path="tasks" element={<PortalTasks />} />
          <Route path="documents" element={<PortalDocuments />} />
          <Route path="questionnaires" element={<PortalQuestionnaires />} />
          <Route path="questionnaires/:id" element={<PortalQuestionnaireResponse />} />
          <Route path="messages" element={<PortalMessages />} />
          <Route path="payments" element={<PortalPayments />} />
          <Route path="bookkeeping" element={<PortalBookkeeping />} />
          <Route path="settings" element={<PortalSettings />} />
        </Route>
      </Route>

      <Route path="*" element={<PortalNotFound />} />
    </Routes>
  );
}