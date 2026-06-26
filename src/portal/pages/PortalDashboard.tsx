import { CheckSquare, ClipboardList, CreditCard, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalPageHeader } from "../components/PortalPageHeader";
import {
  usePortalConversations,
  usePortalPayments,
  usePortalQuestionnaires,
  usePortalTasks,
  usePortalUpcomingDeadlines,
  usePortalTaxPayments,
} from "../hooks/usePortalData";
import { usePortalEntity } from "../contexts/PortalEntityContext";
import { DeadlineListCard } from "../components/dashboard/DeadlineListCard";
import { portalPath } from "../utils/portalPaths";

function Tile({
  label,
  value,
  icon: Icon,
  to,
  loading,
}: {
  label: string;
  value: number | string;
  icon: typeof CheckSquare;
  to: string;
  loading?: boolean;
}) {
  return (
    <Link to={to} className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-lg">
      <Card className="hover:border-primary/40 hover:shadow-sm transition">
        <CardContent className="p-6 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            {loading ? (
              <Skeleton className="h-8 w-12 mt-2" />
            ) : (
              <p className="text-3xl font-semibold mt-1">{value}</p>
            )}
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function PortalDashboard() {
  const { currentEntity } = usePortalEntity();
  const tasks = usePortalTasks();
  const questionnaires = usePortalQuestionnaires();
  const payments = usePortalPayments();
  const conversations = usePortalConversations();
  const deadlines = usePortalUpcomingDeadlines();
  const taxPayments = usePortalTaxPayments();

  const openTasks = (tasks.data ?? []).filter(
    (t) => t.status !== "completed" && t.status !== "done",
  ).length;
  const openQuestionnaires = (questionnaires.data ?? []).filter(
    (q) => q.status !== "submitted" && q.status !== "reviewed",
  ).length;
  const unpaidInvoices = (payments.data ?? []).filter(
    (p) => p.status !== "PAID" && p.status !== "paid" && !p.paidAt,
  ).length;
  const conversationCount = (conversations.data ?? []).length;

  return (
    <div className="p-6 space-y-6">
      <PortalPageHeader
        title="Dashboard"
        description={
          currentEntity ? `Overview for ${currentEntity.displayName}.` : "Overview."
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Open Tasks" value={openTasks} icon={CheckSquare} to={portalPath("tasks")} loading={tasks.isLoading} />
        <Tile label="Open Questionnaires" value={openQuestionnaires} icon={ClipboardList} to={portalPath("questionnaires")} loading={questionnaires.isLoading} />
        <Tile label="Unpaid Invoices" value={unpaidInvoices} icon={CreditCard} to={portalPath("payments")} loading={payments.isLoading} />
        <Tile label="Conversations" value={conversationCount} icon={MessageSquare} to={portalPath("messages")} loading={conversations.isLoading} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DeadlineListCard
          title="Upcoming Deadlines"
          emptyMessage="No Upcoming Deadlines In The Next 90 Days."
          viewAllLabel="View All Deadlines"
          viewAllTo={portalPath("tasks")}
          loading={deadlines.isLoading}
          rows={deadlines.data ?? []}
          dateField="dueDate"
        />
        <DeadlineListCard
          title="Tax Payments Due"
          emptyMessage="No Tax Payments Due In The Next 90 Days."
          viewAllLabel="View All Payments"
          viewAllTo={portalPath("payments")}
          loading={taxPayments.isLoading}
          rows={taxPayments.data ?? []}
          dateField="paymentDate"
          showAmount
        />
      </div>
    </div>
  );
}