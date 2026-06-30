/**
 * Portal Domain Types
 *
 * UI consumes these typed DTOs. Services in `src/portal/services/*` are the
 * only place that touches Supabase rows; they must adapt accountant-backend
 * shapes into these DTOs.
 *
 * See docs/portal-schema-mapping.md for the backing table/RPC per concept.
 */

export type PortalEntityType = "company" | "client";

export interface PortalUserContext {
  userId: string;
  email: string;
  organizationId: string;
  /** Active portal-access records for this user. */
  access: PortalAccessRecord[];
}

export interface PortalAccessRecord {
  id: string;
  organizationId: string;
  clientId: string | null;
  companyId: string | null;
  role: string;
  isActive: boolean;
}

export interface PortalEntity {
  id: string;
  type: PortalEntityType;
  displayName: string;
  organizationId: string;
  registrationNumber?: string | null;
  taxReference?: string | null;
}

export interface PortalClientProfile {
  entity: PortalEntity;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
}

export interface PortalTask {
  id: string;
  title: string;
  status: string;
  dueAt?: string | null;
  relatedJobId?: string | null;
}

export type PortalDocumentSource =
  | "job_document"
  | "questionnaire_file"
  | "kyc_document"
  | "receipt";

export interface PortalDocument {
  id: string;
  source: PortalDocumentSource;
  title: string;
  uploadedAt: string;
  downloadUrl: string | null;
  description?: string | null;
}

export interface PortalQuestionnaire {
  id: string;
  title: string;
  status: string;
  dueAt?: string | null;
  responseUrl?: string | null;
}

export type PortalConversationType = "general" | "job";

export interface PortalConversation {
  id: string;
  type: PortalConversationType;
  subject: string;
  lastMessageAt: string;
  unreadCount: number;
  relatedJobId?: string | null;
}

export interface PortalMessage {
  id: string;
  conversationId: string;
  sender: "client" | "accountant";
  sentAt: string;
  body: string;
  senderName?: string | null;
}

export interface PortalPayment {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  dueAt?: string | null;
  paidAt?: string | null;
  payUrl?: string | null;
}

export interface PortalFinancialSummary {
  asOf: string;
  revenueYTD?: number | null;
  netProfitYTD?: number | null;
  cashBalance?: number | null;
  vatPosition?: number | null;
  corporationTaxEstimate?: number | null;
}

export interface PortalVisibilitySettings {
  showRevenue: boolean;
  showProfit: boolean;
  showCash: boolean;
  showVatPosition: boolean;
  showCtEstimate: boolean;
  showReceivablesPayables: boolean;
  showTransactions: boolean;
  showBankAccounts: boolean;
  showInvoices: boolean;
  showTrialBalance: boolean;
  showDetailedLedger: boolean;
}