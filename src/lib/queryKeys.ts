/**
 * Centralized Query Key Registry
 * Provides stable, reusable query keys for React Query
 * Ensures consistent cache invalidation and prevents key drift
 */

export const queryKeys = {
  // Organization
  organization: (orgId: string) => ['organization', orgId] as const,
  organizations: ['organizations'] as const,
  organizationUsers: (orgId: string) => ['organization-users', orgId] as const,
  
  // Authentication
  session: ['session'] as const,
  user: ['user'] as const,
  
  // Clients
  clients: (orgId: string) => ['clients', orgId] as const,
  client: (clientId: string) => ['client', clientId] as const,
  clientPortal: (clientId: string) => ['client-portal', clientId] as const,
  
  // Companies
  companies: (orgId: string) => ['companies', orgId] as const,
  company: (companyId: string) => ['company', companyId] as const,
  companyDetails: (companyNumber: string) => ['company-details', companyNumber] as const,
  
  // Jobs
  jobs: (orgId: string, filters?: Record<string, unknown>) => 
    filters ? ['jobs', orgId, filters] as const : ['jobs', orgId] as const,
  job: (jobId: string) => ['job', jobId] as const,
  jobTasks: (jobId: string) => ['job-tasks', jobId] as const,
  jobDocuments: (jobId: string) => ['job-documents', jobId] as const,
  jobTemplate: (templateId: string) => ['job-template', templateId] as const,
  jobTemplates: (orgId: string) => ['job-templates', orgId] as const,
  
  // Deadlines
  deadlines: (orgId: string, filters?: Record<string, unknown>) => 
    filters ? ['deadlines', orgId, filters] as const : ['deadlines', orgId] as const,
  deadline: (deadlineId: string) => ['deadline', deadlineId] as const,
  
  // Filings
  filings: (orgId: string, filters?: Record<string, unknown>) => 
    filters ? ['filings', orgId, filters] as const : ['filings', orgId] as const,
  filing: (filingId: string) => ['filing', filingId] as const,
  filingArtefacts: (filingId: string) => ['filing-artefacts', filingId] as const,
  filingSubmissions: (filingId: string) => ['filing-submissions', filingId] as const,
  
  // Bookkeeping
  accounts: (orgId: string, entityId?: string) => 
    entityId ? ['accounts', orgId, entityId] as const : ['accounts', orgId] as const,
  ledgerEntries: (orgId: string, filters?: Record<string, unknown>) => 
    filters ? ['ledger-entries', orgId, filters] as const : ['ledger-entries', orgId] as const,
  journals: (orgId: string) => ['journals', orgId] as const,
  trialBalance: (orgId: string, entityId: string, periodEnd: string) => 
    ['trial-balance', orgId, entityId, periodEnd] as const,
  bankAccounts: (orgId: string) => ['bank-accounts', orgId] as const,
  bankTransactions: (bankAccountId: string) => ['bank-transactions', bankAccountId] as const,
  
  // Invoices & Bills
  invoices: (orgId: string, filters?: Record<string, unknown>) => 
    filters ? ['invoices', orgId, filters] as const : ['invoices', orgId] as const,
  invoice: (invoiceId: string) => ['invoice', invoiceId] as const,
  bills: (orgId: string, filters?: Record<string, unknown>) => 
    filters ? ['bills', orgId, filters] as const : ['bills', orgId] as const,
  bill: (billId: string) => ['bill', billId] as const,
  customers: (orgId: string) => ['customers', orgId] as const,
  suppliers: (orgId: string) => ['suppliers', orgId] as const,
  
  // Email
  emailQueue: (orgId: string, filters?: Record<string, unknown>) => 
    filters ? ['email-queue', orgId, filters] as const : ['email-queue', orgId] as const,
  emailMessages: (orgId: string) => ['email-messages', orgId] as const,
  connectedMailboxes: (orgId: string) => ['connected-mailboxes', orgId] as const,
  
  // Templates
  templates: (orgId: string, type?: string) => 
    type ? ['templates', orgId, type] as const : ['templates', orgId] as const,
  template: (templateId: string) => ['template', templateId] as const,
  
  // Automations
  automationRules: (orgId: string) => ['automation-rules', orgId] as const,
  automationExecutions: (orgId: string) => ['automation-executions', orgId] as const,
  
  // Quotes & Onboarding
  quotes: (orgId: string) => ['quotes', orgId] as const,
  quote: (quoteId: string) => ['quote', quoteId] as const,
  onboardingApplications: (orgId: string) => ['onboarding-applications', orgId] as const,
  onboardingApplication: (applicationId: string) => ['onboarding-application', applicationId] as const,
  
  // CRM
  leads: (orgId: string) => ['leads', orgId] as const,
  lead: (leadId: string) => ['lead', leadId] as const,
  
  // Payroll
  payeSchemes: (orgId: string) => ['paye-schemes', orgId] as const,
  employees: (orgId: string, schemeId?: string) => 
    schemeId ? ['employees', orgId, schemeId] as const : ['employees', orgId] as const,
  payRuns: (orgId: string) => ['pay-runs', orgId] as const,
  payRun: (payRunId: string) => ['pay-run', payRunId] as const,
  
  // CIS
  cisContractors: (orgId: string) => ['cis-contractors', orgId] as const,
  cisSubcontractors: (orgId: string) => ['cis-subcontractors', orgId] as const,
  cisReturns: (orgId: string) => ['cis-returns', orgId] as const,
  
  // Workpapers
  workpapers: (orgId: string) => ['workpapers', orgId] as const,
  workpaper: (workpaperId: string) => ['workpaper', workpaperId] as const,
  workpaperTemplates: (orgId: string) => ['workpaper-templates', orgId] as const,
  
  // VAT
  vatPeriods: (orgId: string, entityId: string) => ['vat-periods', orgId, entityId] as const,
  vatReturn: (periodId: string) => ['vat-return', periodId] as const,
  
  // Notifications
  notifications: (userId: string) => ['notifications', userId] as const,
  unreadNotificationCount: (userId: string) => ['unread-notification-count', userId] as const,
  
  // Integrations
  hmrcIntegration: (orgId: string) => ['hmrc-integration', orgId] as const,
  chIntegration: (orgId: string) => ['ch-integration', orgId] as const,
  
  // Subscription
  subscription: (orgId: string) => ['subscription', orgId] as const,
  subscriptionCache: (orgId: string) => ['subscription-cache', orgId] as const,
  
  // Portal
  portalEntities: (userId: string) => ['portal-entities', userId] as const,
  portalVisibility: (entityId: string) => ['portal-visibility', entityId] as const,
} as const;

/**
 * Helper to get all keys that should be invalidated when an entity changes
 */
export const getInvalidationKeys = {
  client: (orgId: string, clientId: string) => [
    queryKeys.clients(orgId),
    queryKeys.client(clientId),
    queryKeys.clientPortal(clientId),
  ],
  
  company: (orgId: string, companyId: string) => [
    queryKeys.companies(orgId),
    queryKeys.company(companyId),
  ],
  
  job: (orgId: string, jobId: string) => [
    queryKeys.jobs(orgId),
    queryKeys.job(jobId),
    queryKeys.jobTasks(jobId),
  ],
  
  filing: (orgId: string, filingId: string) => [
    queryKeys.filings(orgId),
    queryKeys.filing(filingId),
    queryKeys.filingArtefacts(filingId),
    queryKeys.filingSubmissions(filingId),
  ],
  
  invoice: (orgId: string, invoiceId: string) => [
    queryKeys.invoices(orgId),
    queryKeys.invoice(invoiceId),
  ],
  
  deadline: (orgId: string, deadlineId: string) => [
    queryKeys.deadlines(orgId),
    queryKeys.deadline(deadlineId),
  ],
};
