import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Link2, AlertCircle, FileText } from "lucide-react";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/bookkeeping-utils";
import { toast } from "sonner";
import {
  findMatchingCandidates,
  applyMatch,
  type MatchCandidate,
  type MatchPlan,
} from "@/lib/matching-service";
import { useState } from "react";

interface MatchingSuggestionsPanelProps {
  transactionId: string | null;
  onMatchApplied?: () => void;
}

export function MatchingSuggestionsPanel({
  transactionId,
  onMatchApplied,
}: MatchingSuggestionsPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["matching-candidates", transactionId],
    queryFn: () => findMatchingCandidates(transactionId!),
    enabled: !!transactionId,
  });

  const candidates = data?.candidates || [];
  const transaction = data?.transaction;

  const applyMutation = useMutation({
    mutationFn: async (candidate: MatchCandidate) => {
      if (!user?.id) throw new Error("Not authenticated");

      const allocation = adjustments[candidate.id] ?? candidate.proposedAllocation;

      const matchPlan: MatchPlan = {
        allocations: [
          {
            documentId: candidate.id,
            documentType: candidate.type,
            amount: allocation,
          },
        ],
      };

      const result = await applyMatch(transactionId!, matchPlan, user.id);
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matching-candidates"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      toast.success("Match applied successfully");
      onMatchApplied?.();
    },
    onError: (error) => {
      toast.error("Failed to apply match", { description: error.message });
    },
  });

  const getConfidenceColor = (confidence: number) => {
    if (confidence === 100) return "bg-green-500";
    if (confidence >= 70) return "bg-yellow-500";
    return "bg-gray-400";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence === 100) return "Perfect";
    if (confidence >= 90) return "High";
    if (confidence >= 70) return "Good";
    if (confidence >= 50) return "Possible";
    return "Low";
  };

  if (!transactionId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Matching Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Select a transaction to see matching suggestions</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Matching Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Matching Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Transaction Summary */}
        {transaction && (
          <div className="p-3 bg-muted rounded-lg mb-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-sm">
                  {format(new Date(transaction.transaction_date), "dd/MM/yyyy")}
                </p>
                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {transaction.description}
                </p>
              </div>
              <span
                className={`font-mono font-bold ${
                  transaction.amount > 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatCurrency(transaction.amount)}
              </span>
            </div>
          </div>
        )}

        {/* Candidates */}
        {candidates.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No matching documents found</p>
            <p className="text-xs mt-1">
              Create a manual entry or categorize this transaction directly
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {candidates.map((candidate) => {
              const allocation = adjustments[candidate.id] ?? candidate.proposedAllocation;
              const isAdjusted = adjustments[candidate.id] !== undefined;

              return (
                <div
                  key={candidate.id}
                  className={`p-3 border rounded-lg ${
                    candidate.confidence === 100 ? "border-green-200 bg-green-50 dark:bg-green-950/20" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {candidate.type === "invoice" ? "Invoice" : "Bill"}
                        </Badge>
                        <span className="font-medium text-sm">{candidate.documentNumber}</span>
                        <Badge className={`text-xs ${getConfidenceColor(candidate.confidence)}`}>
                          {candidate.confidence}% {getConfidenceLabel(candidate.confidence)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {candidate.contactName}
                      </p>
                      <div className="flex gap-4 text-xs mt-1">
                        <span>Date: {format(new Date(candidate.documentDate), "dd/MM/yy")}</span>
                        <span>Outstanding: {formatCurrency(candidate.outstandingAmount)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {candidate.explanation}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Allocate:</label>
                      <Input
                        type="number"
                        step="0.01"
                        value={allocation}
                        onChange={(e) =>
                          setAdjustments((prev) => ({
                            ...prev,
                            [candidate.id]: Number(e.target.value),
                          }))
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      onClick={() => applyMutation.mutate(candidate)}
                      disabled={applyMutation.isPending || allocation <= 0}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Apply
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
