import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Building2, Plus, ArrowRightLeft, Unlink, MessageSquare, Calendar, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  getActiveLink,
  getPendingClientApprovalLinks,
  clientDisconnect,
  acceptLinkRequest,
  declineLinkRequest,
} from "@/lib/accountant-link-service";
import { useAuth } from "@/lib/auth-context";
import AddAccountantDialog from "./AddAccountantDialog";
import SwitchAccountantDialog from "./SwitchAccountantDialog";

interface YourAccountantSectionProps {
  clientId: string | null;
  companyId: string | null;
}

export default function YourAccountantSection({
  clientId,
  companyId,
}: YourAccountantSectionProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);

  // Get active link
  const { data: activeLink, isLoading: isLoadingLink } = useQuery({
    queryKey: ["active-accountant-link", clientId, companyId],
    queryFn: () => getActiveLink(clientId, companyId),
    enabled: !!(clientId || companyId),
  });

  // Get pending requests (from practices wanting to link)
  const { data: pendingRequests } = useQuery({
    queryKey: ["pending-link-requests", user?.id],
    queryFn: () => getPendingClientApprovalLinks(user?.id || ""),
    enabled: !!user?.id,
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: (linkId: string) => clientDisconnect(linkId),
    onSuccess: () => {
      toast.success("Disconnected from accountant");
      queryClient.invalidateQueries({ queryKey: ["active-accountant-link"] });
    },
    onError: () => {
      toast.error("Failed to disconnect");
    },
  });

  // Accept link request
  const acceptMutation = useMutation({
    mutationFn: (linkId: string) => acceptLinkRequest(linkId),
    onSuccess: () => {
      toast.success("Accountant linked successfully");
      queryClient.invalidateQueries({ queryKey: ["active-accountant-link"] });
      queryClient.invalidateQueries({ queryKey: ["pending-link-requests"] });
    },
    onError: () => {
      toast.error("Failed to accept request");
    },
  });

  // Decline link request
  const declineMutation = useMutation({
    mutationFn: (linkId: string) => declineLinkRequest(linkId),
    onSuccess: () => {
      toast.success("Request declined");
      queryClient.invalidateQueries({ queryKey: ["pending-link-requests"] });
    },
    onError: () => {
      toast.error("Failed to decline request");
    },
  });

  if (isLoadingLink) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pending Requests */}
      {pendingRequests && pendingRequests.length > 0 && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Pending Requests</CardTitle>
            <CardDescription>
              These accountants want to link with your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map((request: any) => (
              <div
                key={request.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{request.practice?.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {request.practice?.practice_description || "Accountancy practice"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => declineMutation.mutate(request.id)}
                    disabled={declineMutation.isPending}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => acceptMutation.mutate(request.id)}
                    disabled={acceptMutation.isPending}
                  >
                    Accept
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Main Accountant Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Your Accountant
          </CardTitle>
          <CardDescription>
            {activeLink
              ? "Manage your accountant relationship"
              : "Link your account with your accountant's practice"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeLink ? (
            <div className="space-y-4">
              {/* Linked Practice Info */}
              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/50">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{activeLink.practice?.name}</h3>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Firm Code: {activeLink.practice?.firm_code}
                  </p>
                  {activeLink.activated_at && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <Calendar className="h-3 w-3" />
                      Linked since {format(new Date(activeLink.activated_at), "d MMM yyyy")}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Contact Accountant
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSwitchDialog(true)}
                >
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Switch Accountant
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive">
                      <Unlink className="h-4 w-4 mr-2" />
                      Disconnect
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disconnect from accountant?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove {activeLink.practice?.name}'s access to your
                        account and documents going forward. Historical records will
                        remain in your account.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => disconnectMutation.mutate(activeLink.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {disconnectMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Disconnect
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                <Building2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-muted-foreground">
                  You're not currently linked to an accountant
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add your accountant to give them access to your records
                </p>
              </div>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add My Accountant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddAccountantDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        clientId={clientId}
        companyId={companyId}
      />

      {activeLink && (
        <SwitchAccountantDialog
          open={showSwitchDialog}
          onOpenChange={setShowSwitchDialog}
          clientId={clientId}
          companyId={companyId}
          currentLinkId={activeLink.id}
          currentPracticeName={activeLink.practice?.name || ""}
        />
      )}
    </div>
  );
}
