import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import type { BookkeepingEntity } from "./EntitySelector";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { JournalEditor } from "./JournalEditor";
import { formatCurrency, getJournalTypeLabel } from "@/lib/bookkeeping-utils";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface JournalsTabProps {
  entity: BookkeepingEntity;
}

export function JournalsTab({ entity }: JournalsTabProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editJournal, setEditJournal] = useState<any>(null);
  const { organization } = useOrganization();

  const { data: journals, isLoading } = useQuery({
    queryKey: ["journals", organization?.id, entity.type, entity.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const query = supabase
        .from("journals")
        .select("*")
        .eq("organization_id", organization.id)
        .order("journal_date", { ascending: false });

      if (entity.type === "client") {
        query.eq("client_id", entity.id);
      } else {
        query.eq("company_id", entity.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!organization?.id,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Journals</h2>
          <p className="text-sm text-muted-foreground">
            Manual journal entries for {entity.name}
          </p>
        </div>
        <Button onClick={() => { setEditJournal(null); setEditorOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Journal
        </Button>
      </div>

      {isLoading ? (
        <div>Loading journals...</div>
      ) : !journals || journals.length === 0 ? (
        <div className="flex items-center justify-center h-[400px] border border-dashed rounded-lg">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">No journals yet</p>
            <p className="text-sm text-muted-foreground">
              Create your first journal entry
            </p>
          </div>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Total Dr</TableHead>
                <TableHead className="text-right">Total Cr</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journals.map((journal) => (
                <TableRow
                  key={journal.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setEditJournal(journal);
                    setEditorOpen(true);
                  }}
                >
                  <TableCell>{format(new Date(journal.journal_date), "dd/MM/yyyy")}</TableCell>
                  <TableCell className="font-mono">{journal.reference || "—"}</TableCell>
                  <TableCell>{journal.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {getJournalTypeLabel(journal.journal_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(journal.total_debit)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(journal.total_credit)}
                  </TableCell>
                  <TableCell>
                    {journal.is_posted ? (
                      <Badge variant="default">Posted</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <JournalEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        entity={entity}
        journal={editJournal}
      />
    </div>
  );
}
