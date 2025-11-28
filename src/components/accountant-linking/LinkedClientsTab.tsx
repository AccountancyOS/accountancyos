import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { User, Building2, Check, X, Clock, Link2, Unlink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  getLinkedClients,
  getIncomingPracticeRequests,
  getOutgoingPracticeRequests,
  acceptLinkRequest,
  declineLinkRequest,
  practiceDisconnect,
  completeAccountantSwitch,
} from "@/lib/accountant-link-service";
import { useOrganization } from "@/lib/organization-context";

export default function LinkedClientsTab() {
  const { organization } = useOrganization();
  const queryClient = useQueryClient();

  // Get linked clients
  const { data: linkedClients, isLoading: isLoadingLinked } = useQuery({
    queryKey: ["linked-clients", organization?.id],
    queryFn: () => getLinkedClients(organization?.id || ""),
    enabled: !!organization?.id,
  });

  // Get incoming requests
  const { data: incomingRequests, isLoading: isLoadingIncoming } = useQuery({
    queryKey: ["incoming-link-requests", organization?.id],
    queryFn: () => getIncomingPracticeRequests(organization?.id || ""),
    enabled: !!organization?.id,
  });

  // Get outgoing requests
  const { data: outgoingRequests, isLoading: isLoadingOutgoing } = useQuery({
    queryKey: ["outgoing-link-requests", organization?.id],
    queryFn: () => getOutgoingPracticeRequests(organization?.id || ""),
    enabled: !!organization?.id,
  });

  // Accept mutation
  const acceptMutation = useMutation({
    mutationFn: async (request: any) => {
      // Check if this is a switch request
      if (request.notes?.includes("Switch from link")) {
        const oldLinkId = request.notes.split("Switch from link ")[1];
        return completeAccountantSwitch(request.id, oldLinkId);
      }
      return acceptLinkRequest(request.id);
    },
    onSuccess: () => {
      toast.success("Client linked successfully");
      queryClient.invalidateQueries({ queryKey: ["linked-clients"] });
      queryClient.invalidateQueries({ queryKey: ["incoming-link-requests"] });
    },
    onError: () => {
      toast.error("Failed to accept request");
    },
  });

  // Decline mutation
  const declineMutation = useMutation({
    mutationFn: (linkId: string) => declineLinkRequest(linkId),
    onSuccess: () => {
      toast.success("Request declined");
      queryClient.invalidateQueries({ queryKey: ["incoming-link-requests"] });
    },
    onError: () => {
      toast.error("Failed to decline request");
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: (linkId: string) => practiceDisconnect(linkId),
    onSuccess: () => {
      toast.success("Client unlinked");
      queryClient.invalidateQueries({ queryKey: ["linked-clients"] });
    },
    onError: () => {
      toast.error("Failed to unlink client");
    },
  });

  const getClientName = (link: any) => {
    if (link.client) {
      return `${link.client.first_name} ${link.client.last_name}`;
    }
    if (link.company) {
      return link.company.company_name;
    }
    return "Unknown";
  };

  const getClientEmail = (link: any) => {
    return link.client?.email || link.company?.email || "";
  };

  const isSwitch = (request: any) => {
    return request.notes?.includes("Switch from link");
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="linked" className="w-full">
        <TabsList>
          <TabsTrigger value="linked" className="gap-2">
            <Link2 className="h-4 w-4" />
            Linked Clients
            {linkedClients && linkedClients.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {linkedClients.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="incoming" className="gap-2">
            <Clock className="h-4 w-4" />
            Incoming Requests
            {incomingRequests && incomingRequests.length > 0 && (
              <Badge variant="default" className="ml-1">
                {incomingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="outgoing" className="gap-2">
            <Clock className="h-4 w-4" />
            Outgoing Requests
            {outgoingRequests && outgoingRequests.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {outgoingRequests.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Linked Clients */}
        <TabsContent value="linked">
          <Card>
            <CardHeader>
              <CardTitle>Portal-Linked Clients</CardTitle>
              <CardDescription>
                Clients using AccountancyOS portal linked to your practice
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingLinked ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : linkedClients && linkedClients.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Linked Since</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedClients.map((link: any) => (
                      <TableRow key={link.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {link.company ? (
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <User className="h-4 w-4 text-muted-foreground" />
                            )}
                            {getClientName(link)}
                          </div>
                        </TableCell>
                        <TableCell>{getClientEmail(link)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {link.company ? "Company" : "Individual"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {link.activated_at
                            ? format(new Date(link.activated_at), "d MMM yyyy")
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <Unlink className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Unlink client?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove your access to {getClientName(link)}'s
                                  portal data. You'll keep your internal records.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => disconnectMutation.mutate(link.id)}
                                >
                                  Unlink
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No linked clients yet</p>
                  <p className="text-sm">
                    Clients can link via your firm code:{" "}
                    <span className="font-mono font-bold">
                      {(organization as any)?.firm_code || "—"}
                    </span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Incoming Requests */}
        <TabsContent value="incoming">
          <Card>
            <CardHeader>
              <CardTitle>Incoming Link Requests</CardTitle>
              <CardDescription>
                Clients wanting to link their AccountancyOS account with your practice
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingIncoming ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : incomingRequests && incomingRequests.length > 0 ? (
                <div className="space-y-3">
                  {incomingRequests.map((request: any) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-4 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        {request.company ? (
                          <Building2 className="h-8 w-8 text-muted-foreground" />
                        ) : (
                          <User className="h-8 w-8 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">{getClientName(request)}</p>
                          <p className="text-sm text-muted-foreground">
                            {getClientEmail(request)}
                          </p>
                          {isSwitch(request) && (
                            <Badge variant="secondary" className="mt-1">
                              Switch request
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground mr-2">
                          {format(new Date(request.created_at), "d MMM")}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => declineMutation.mutate(request.id)}
                          disabled={declineMutation.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => acceptMutation.mutate(request)}
                          disabled={acceptMutation.isPending}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Accept
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No incoming requests</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Outgoing Requests */}
        <TabsContent value="outgoing">
          <Card>
            <CardHeader>
              <CardTitle>Outgoing Link Requests</CardTitle>
              <CardDescription>
                Requests you've sent to clients awaiting their approval
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingOutgoing ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : outgoingRequests && outgoingRequests.length > 0 ? (
                <div className="space-y-3">
                  {outgoingRequests.map((request: any) => (
                    <div
                      key={request.id}
                      className="flex items-center justify-between p-4 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        {request.company ? (
                          <Building2 className="h-8 w-8 text-muted-foreground" />
                        ) : (
                          <User className="h-8 w-8 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">{getClientName(request)}</p>
                          <p className="text-sm text-muted-foreground">
                            {getClientEmail(request)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(request.created_at), "d MMM")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No pending outgoing requests</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
