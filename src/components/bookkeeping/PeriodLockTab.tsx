import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lock, Unlock, AlertTriangle, Calendar } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface PeriodLockTabProps {
  entityType: 'client' | 'company';
  entityId: string;
}

export function PeriodLockTab({ entityType, entityId }: PeriodLockTabProps) {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const queryClient = useQueryClient();
  const [newLockDate, setNewLockDate] = useState("");
  const [lockReason, setLockReason] = useState("");

  const { data: periodLock, isLoading } = useQuery({
    queryKey: ['period-lock', organizationId, entityType, entityId],
    queryFn: async () => {
      const query = supabase
        .from('period_locks')
        .select('*')
        .eq('organization_id', organizationId!);

      if (entityType === 'client') {
        query.eq('client_id', entityId).is('company_id', null);
      } else {
        query.eq('company_id', entityId).is('client_id', null);
      }

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId && !!entityId,
  });

  const { data: transactionCount } = useQuery({
    queryKey: ['transaction-count-before-lock', organizationId, entityType, entityId, newLockDate],
    queryFn: async () => {
      if (!newLockDate) return 0;
      
      const query = supabase
        .from('ledger_entries')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId!)
        .lte('transaction_date', newLockDate);

      if (entityType === 'client') {
        query.eq('client_id', entityId);
      } else {
        query.eq('company_id', entityId);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
    enabled: !!organizationId && !!entityId && !!newLockDate,
  });

  const lockMutation = useMutation({
    mutationFn: async () => {
      if (periodLock) {
        // Update existing lock
        const { error } = await supabase
          .from('period_locks')
          .update({
            lock_date: newLockDate,
            reason: lockReason || null,
            locked_at: new Date().toISOString(),
          })
          .eq('id', periodLock.id);
        if (error) throw error;
      } else {
        // Create new lock
        const { error } = await supabase
          .from('period_locks')
          .insert({
            organization_id: organizationId,
            client_id: entityType === 'client' ? entityId : null,
            company_id: entityType === 'company' ? entityId : null,
            lock_date: newLockDate,
            reason: lockReason || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['period-lock'] });
      toast.success("Period lock updated");
      setLockReason("");
    },
    onError: (error) => {
      toast.error("Failed to update period lock");
      console.error(error);
    },
  });

  const unlockMutation = useMutation({
    mutationFn: async () => {
      if (!periodLock) return;
      const { error } = await supabase
        .from('period_locks')
        .delete()
        .eq('id', periodLock.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['period-lock'] });
      toast.success("Period lock removed");
      setNewLockDate("");
    },
  });

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Period Lock</h3>
        <p className="text-sm text-muted-foreground">
          Lock periods to prevent changes to transactions before a specific date
        </p>
      </div>

      {periodLock ? (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Lock className="h-5 w-5" />
              Period Locked
            </CardTitle>
            <CardDescription>
              Transactions on or before this date cannot be modified
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-2xl font-bold">
                <Calendar className="h-6 w-6 text-muted-foreground" />
                {format(new Date(periodLock.lock_date), 'dd MMMM yyyy')}
              </div>
            </div>
            {periodLock.reason && (
              <p className="text-sm text-muted-foreground">
                <strong>Reason:</strong> {periodLock.reason}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Locked on {format(new Date(periodLock.locked_at), 'dd MMM yyyy HH:mm')}
            </p>
            
            <div className="flex gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setNewLockDate(periodLock.lock_date);
                }}
              >
                Change Lock Date
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => unlockMutation.mutate()}
                disabled={unlockMutation.isPending}
              >
                <Unlock className="h-4 w-4 mr-2" />
                Remove Lock
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Period Lock</AlertTitle>
          <AlertDescription>
            All historical transactions can be modified. Consider locking completed periods to maintain data integrity.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{periodLock ? 'Update' : 'Set'} Period Lock</CardTitle>
          <CardDescription>
            Choose a date - all transactions on or before this date will be locked
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Lock Date</Label>
            <Input
              type="date"
              value={newLockDate}
              onChange={(e) => setNewLockDate(e.target.value)}
            />
          </div>

          {newLockDate && transactionCount !== undefined && transactionCount > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This will lock <strong>{transactionCount}</strong> transaction{transactionCount !== 1 ? 's' : ''} from being modified.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              placeholder="e.g., Year-end accounts finalised, VAT return submitted"
            />
          </div>

          <Button 
            onClick={() => lockMutation.mutate()}
            disabled={!newLockDate || lockMutation.isPending}
          >
            <Lock className="h-4 w-4 mr-2" />
            {periodLock ? 'Update Lock' : 'Lock Period'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What Gets Locked?</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>Journal entries with dates on or before the lock date</li>
            <li>Bank transactions on or before the lock date</li>
            <li>Invoices with dates on or before the lock date</li>
            <li>Any ledger entries within the locked period</li>
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            <strong>Note:</strong> Period locking is enforced at the application level. 
            Admins can still remove or adjust the lock if necessary.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
