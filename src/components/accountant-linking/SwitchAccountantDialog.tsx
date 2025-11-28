import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Building2, ArrowRight, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  searchPractices,
  getPracticeByFirmCode,
  initiateAccountantSwitch,
} from "@/lib/accountant-link-service";
import { useAuth } from "@/lib/auth-context";

interface SwitchAccountantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  companyId: string | null;
  currentLinkId: string;
  currentPracticeName: string;
}

export default function SwitchAccountantDialog({
  open,
  onOpenChange,
  clientId,
  companyId,
  currentLinkId,
  currentPracticeName,
}: SwitchAccountantDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [firmCode, setFirmCode] = useState("");
  const [selectedPractice, setSelectedPractice] = useState<any>(null);
  const [step, setStep] = useState<"select" | "confirm">("select");

  // Search practices
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["practice-search-switch", searchQuery],
    queryFn: () => searchPractices(searchQuery),
    enabled: searchQuery.length >= 2,
  });

  // Lookup by firm code
  const firmCodeMutation = useMutation({
    mutationFn: (code: string) => getPracticeByFirmCode(code),
    onSuccess: (data) => {
      if (data) {
        setSelectedPractice(data);
        setStep("confirm");
      } else {
        toast.error("No practice found with that code");
      }
    },
  });

  // Switch mutation
  const switchMutation = useMutation({
    mutationFn: () =>
      initiateAccountantSwitch(
        selectedPractice.id,
        clientId,
        companyId,
        user?.id || "",
        currentLinkId
      ),
    onSuccess: () => {
      toast.success("Switch request sent. Your new accountant will be notified.");
      queryClient.invalidateQueries({ queryKey: ["active-accountant-link"] });
      onOpenChange(false);
      setStep("select");
      setSelectedPractice(null);
    },
    onError: () => {
      toast.error("Failed to initiate switch");
    },
  });

  const handleSelectPractice = (practice: any) => {
    setSelectedPractice(practice);
    setStep("confirm");
  };

  const handleFirmCodeLookup = () => {
    if (firmCode.length >= 4) {
      firmCodeMutation.mutate(firmCode);
    }
  };

  const handleConfirmSwitch = () => {
    switchMutation.mutate();
  };

  const handleBack = () => {
    setStep("select");
    setSelectedPractice(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Switch Accountant</DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Select your new accountant"
              : "Confirm your accountant switch"}
          </DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <div className="space-y-4">
            {/* Search */}
            <div className="space-y-2">
              <Label>Search for new accountant</Label>
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
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {searchResults.map((practice) => (
                  <Card
                    key={practice.id}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => handleSelectPractice(practice)}
                  >
                    <CardContent className="p-3 flex items-center gap-3">
                      <Building2 className="h-6 w-6 text-muted-foreground" />
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

            {/* Firm Code */}
            <div className="space-y-2 pt-2 border-t">
              <Label>Or enter firm code</Label>
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
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Alert variant="default" className="bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                When your new accountant accepts, {currentPracticeName} will lose
                access to your account.
              </AlertDescription>
            </Alert>

            {/* Switch visualization */}
            <div className="flex items-center justify-center gap-4 py-4">
              <div className="text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-2">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">{currentPracticeName}</p>
                <p className="text-xs text-muted-foreground">Current</p>
              </div>

              <ArrowRight className="h-6 w-6 text-muted-foreground" />

              <div className="text-center">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-medium">{selectedPractice?.name}</p>
                <p className="text-xs text-muted-foreground">New</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleConfirmSwitch}
                disabled={switchMutation.isPending}
                className="flex-1"
              >
                {switchMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Confirm Switch
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
