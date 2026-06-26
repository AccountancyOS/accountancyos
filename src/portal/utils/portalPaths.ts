export function isClientPortalDomain(hostname?: string) {
  const host = hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  return host === "client.accountancyos.com" || host.startsWith("client.");
}

export function isPortalSurface(pathname?: string) {
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  return isClientPortalDomain() || path.startsWith("/portal");
}

const portalPaths = {
  dashboard: { client: "/dashboard", app: "/portal/dashboard" },
  tasks: { client: "/tasks", app: "/portal/tasks" },
  documents: { client: "/documents", app: "/portal/documents" },
  questionnaires: { client: "/questionnaires", app: "/portal/questionnaires" },
  messages: { client: "/messages", app: "/portal/messages" },
  payments: { client: "/payments", app: "/portal/payments" },
  bookkeeping: { client: "/banking", app: "/portal/bookkeeping" },
  banking: { client: "/banking", app: "/portal/bookkeeping?tab=banking" },
  settings: { client: "/profile", app: "/portal/settings" },
  login: { client: "/login", app: "/portal/login" },
  forgotPassword: { client: "/forgot-password", app: "/portal/forgot-password" },
  resetPassword: { client: "/reset-password", app: "/portal/reset-password" },
} as const;

export type PortalPathKey = keyof typeof portalPaths;

export function portalPath(key: PortalPathKey) {
  const paths = portalPaths[key];
  return isClientPortalDomain() ? paths.client : paths.app;
}

export function withReturnTo(loginPath: string, returnTo: string) {
  const params = new URLSearchParams({ returnTo });
  return `${loginPath}?${params.toString()}`;
}