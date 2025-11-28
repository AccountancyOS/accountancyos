import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Building2, Mail, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  searchPractices,
  getPracticeByFirmCode,
  clientRequestLink,
  createPendingPracticeSignup,
} from "@/lib/accountant-link-service";
import { useAuth } from "@/lib/auth-context";

interface AddAccountantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  companyId: string | null;
}

export default function AddAccountantDialog({
  open,
  onOpenChange,
  clientId,
  companyId,
}: AddAccountantDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [firmCode, setFirmCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedPractice, setSelectedPractice] = useState<any>(null);

  // Search practices
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["practice-search", searchQuery],
    queryFn: () => searchPractices(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  // Lookup by firm code
  const firmCodeMutation = useMutation({
    mutationFn: (code: string) => getPracticeByFirmCode(code),
    onSuccess: (data) => {
      if (data) {
        setSelectedPractice(data);
        toast.success("Practice found!");
      } else {
        toast.error("No practice found with that code");
      }
    },
  });

  // Request link mutation
  const requestLinkMutation = useMutation({
    mutationFn: (practiceId: string) =>
      clientRequestLink(practiceId, clientId, companyId, user?.id || ""),
    onSuccess: () => {
      toast.success("Link request sent to your accountant");
      queryClient.invalidateQueries({ queryKey: ["active-accountant-link"] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Invite by email mutation
  const inviteByEmailMutation = useMutation({
    mutationFn: () =>
      createPendingPracticeSignup(inviteEmail, clientId, companyId),
    onSuccess: () => {
      toast.success("Invitation sent to your accountant");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Failed to send invitation");
    },
  });

  const handleSelectPractice = (practice: any) => {
    setSelectedPractice(practice);
  };

  const handleConfirmSelection = () => {
    if (selectedPractice) {
      requestLinkMutation.mutate(selectedPractice.id);
    }
  };

  const handleFirmCodeLookup = () => {
    if (firmCode.length >= 4) {
      firmCodeMutation.mutate(firmCode);
    }
  };

  const handleInviteByEmail = () => {
    if (inviteEmail && inviteEmail.includes("@")) {
      inviteByEmailMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Your Accountant</DialogTitle>
          <DialogDescription>
            Link your account with your accountant's practice
          </DialogDescription>
        </DialogHeader>

        {selectedPractice ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {selectedPractice.name}
                </CardTitle>
                {selectedPractice.practice_description && (
                  <CardDescription>
                    {selectedPractice.practice_description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Firm Code: {selectedPractice.firm_code}
                </p>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSelectedPractice(null)}
                className="flex-1"
              >
                Back
              </Button>
              <Button
                onClick={handleConfirmSelection}
                disabled={requestLinkMutation.isPending}
                className="flex-1"
              >
                {requestLinkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Send Request
              </Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="search" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="search">Search</TabsTrigger>
              <TabsTrigger value="code">Firm Code</TabsTrigger>
              <TabsTrigger value="invite">Invite</TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Search for your accountant</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by firm name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {isSearching && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {searchResults && searchResults.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {searchResults.map((practice) => (
                    <Card
                      key={practice.id}
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => handleSelectPractice(practice)}
                    >
                      <CardContent className="p-3 flex items-center gap-3">
                        <Building2 className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{practice.name}</p>
                          <p className="text-sm text-muted-foreground">
                            Code: {practice.firm_code}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {searchResults && searchResults.length === 0 && searchQuery.length >= 2 && (
                <p className="text-center text-muted-foreground py-4">
                  No practices found. Try a different search or use firm code.
                </p>
              )}
            </TabsContent>

            <TabsContent value="code" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Enter your accountant's firm code</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. ABC123"
                    value={firmCode}
                    onChange={(e) => setFirmCode(e.target.value.toUpperCase())}
                    maxLength={10}
                  />
                  <Button
                    onClick={handleFirmCodeLookup}
                    disabled={firmCode.length < 4 || firmCodeMutation.isPending}
                  >
                    {firmCodeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Lookup"
                    )}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Ask your accountant for their firm code
                </p>
              </div>
            </TabsContent>

            <TabsContent value="invite" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Invite by email</Label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="accountant@email.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <Button
                    onClick={handleInviteByEmail}
                    disabled={!inviteEmail.includes("@") || inviteByEmailMutation.isPending}
                  >
                    {inviteByEmailMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  If your accountant isn't on AccountancyOS yet, we'll invite them
                </p>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
