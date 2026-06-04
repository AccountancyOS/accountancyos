import { CheckSquare, ClipboardList, CreditCard, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PortalPageHeader } from "../components/PortalPageHeader";
import {
  usePortalConversations,
  usePortalPayments,
  usePortalQuestionnaires,
  usePortalTasks,
} from "../hooks/usePortalData";
import { usePortalEntity } from "../contexts/PortalEntityContext";

function Tile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof CheckSquare;
}) {
  return (
    <Card>
      <CardContent className="p-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold mt-1">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function PortalDashboard() {
  const { currentEntity } = usePortalEntity();
  const tasks = usePortalTasks();
  const questionnaires = usePortalQuestionnaires();
  const payments = usePortalPayments();
  const conversations = usePortalConversations();

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
        <Tile label="Open Tasks" value={openTasks} icon={CheckSquare} />
        <Tile label="Open Questionnaires" value={openQuestionnaires} icon={ClipboardList} />
        <Tile label="Unpaid Invoices" value={unpaidInvoices} icon={CreditCard} />
        <Tile label="Conversations" value={conversationCount} icon={MessageSquare} />
      </div>
    </div>
  );
}