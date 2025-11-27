import { useQuery } from "@tanstack/react-query";
import PortalLayout from "@/components/portal/PortalLayout";
import { usePortal } from "@/lib/portal-context";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, FileText, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { format, isAfter, isBefore, addDays } from "date-fns";

export default function PortalFilings() {
  const { currentSpace } = usePortal();

  const entityType = currentSpace?.type || 'client';
  const entityId = currentSpace?.id || '';

  const { data: deadlines, isLoading: loadingDeadlines } = useQuery({
    queryKey: ['portal-deadlines', entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deadlines')
        .select('*')
        .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
        .order('due_date', { ascending: true });
      
      if (error) throw error;
      return data;
    },
    enabled: !!entityId
  });

  const { data: filings, isLoading: loadingFilings } = useQuery({
    queryKey: ['portal-filings', entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filings')
        .select('*')
        .eq(entityType === 'client' ? 'client_id' : 'company_id', entityId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!entityId
  });

  if (!currentSpace) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">No space selected</p>
        </div>
      </PortalLayout>
    );
  }

  const getDeadlineStatus = (dueDate: string, status: string) => {
    if (status === 'completed') return { label: 'Completed', variant: 'default' as const, icon: CheckCircle };
    const due = new Date(dueDate);
    const now = new Date();
    if (isBefore(due, now)) return { label: 'Overdue', variant: 'destructive' as const, icon: AlertTriangle };
    if (isBefore(due, addDays(now, 7))) return { label: 'Due Soon', variant: 'secondary' as const, icon: Clock };
    return { label: 'Upcoming', variant: 'outline' as const, icon: Calendar };
  };

  const getFilingStatusBadge = (status: string) => {
    switch (status) {
      case 'filed':
        return <Badge className="bg-green-600">Filed</Badge>;
      case 'approved':
        return <Badge className="bg-blue-600">Approved</Badge>;
      case 'pending_approval':
        return <Badge variant="secondary">Awaiting Approval</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Filings & Deadlines</h1>
          <p className="text-muted-foreground">Track your statutory deadlines and filing status</p>
        </div>

        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingDeadlines ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : deadlines && deadlines.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deadlines.map((deadline) => {
                    const statusInfo = getDeadlineStatus(deadline.due_date, deadline.status);
                    const StatusIcon = statusInfo.icon;
                    return (
                      <TableRow key={deadline.id}>
                        <TableCell className="font-medium">{deadline.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{deadline.deadline_type}</Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(deadline.due_date), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.variant} className="flex items-center gap-1 w-fit">
                            <StatusIcon className="h-3 w-3" />
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">No upcoming deadlines</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Filings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Filings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingFilings ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filings && filings.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filing</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Filed</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filings.map((filing) => (
                    <TableRow key={filing.id}>
                      <TableCell className="font-medium">{filing.filing_type}</TableCell>
                      <TableCell>
                        {filing.period_start && filing.period_end ? (
                          `${format(new Date(filing.period_start), 'dd MMM yyyy')} - ${format(new Date(filing.period_end), 'dd MMM yyyy')}`
                        ) : (
                          filing.tax_year || '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {filing.filed_at ? format(new Date(filing.filed_at), 'dd MMM yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        {getFilingStatusBadge(filing.status)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">No filings yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
