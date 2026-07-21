import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, Search, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { searchCompaniesHouse, CHSearchResult } from "@/lib/companies-house-lookup";

interface LinkCompaniesHouseDialogProps {
  companyId: string;
  /** Company's current name, used to prefill the search. */
  defaultQuery?: string;
  /** Called after the company number is written (e.g. to trigger a sync). */
  onLinked?: () => void;
}

/**
 * Search Companies House and attach the chosen company's number to an existing
 * `companies` row that has none — which unblocks the CH sync. Officer/profile
 * enrichment is left to the subsequent sync (which stages diffs for review).
 */
export function LinkCompaniesHouseDialog({ companyId, defaultQuery, onLinked }: LinkCompaniesHouseDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultQuery ?? "");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CHSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [linkingNumber, setLinkingNumber] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      setError("Enter at least 2 characters to search.");
      return;
    }
    setSearching(true);
    setError(null);
    const { data, error: err } = await searchCompaniesHouse(q);
    setSearching(false);
    setHasSearched(true);
    if (err) {
      setError(err);
      setResults([]);
      return;
    }
    setResults(data?.items ?? []);
  };

  const linkCompany = async (result: CHSearchResult) => {
    setLinkingNumber(result.company_number);
    const { error: err } = await supabase
      .from("companies")
      .update({ company_number: result.company_number })
      .eq("id", companyId);
    setLinkingNumber(null);
    if (err) {
      toast.error("Failed to link company", { description: err.message });
      return;
    }
    toast.success(`Linked to ${result.title} (${result.company_number})`, {
      description: "Syncing officers and details from Companies House…",
    });
    queryClient.invalidateQueries({ queryKey: ["company-registers", companyId] });
    queryClient.invalidateQueries({ queryKey: ["company-detail", companyId] });
    queryClient.invalidateQueries({ queryKey: ["ch-sync-data", companyId] });
    setOpen(false);
    onLinked?.();
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery(defaultQuery ?? "");
      setResults([]);
      setError(null);
      setHasSearched(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-[120px]">
          <Link2 className="h-4 w-4 mr-2" />
          Link to Companies House
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link to Companies House</DialogTitle>
          <DialogDescription>
            Search Companies House and select the matching company to set its company number. You can then
            sync its officers and details.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
            placeholder="Company name or number"
            autoFocus
          />
          <Button onClick={runSearch} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="max-h-72 space-y-2 overflow-y-auto">
          {results.map((r) => (
            <div key={r.company_number} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="truncate font-medium">{r.title}</p>
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {r.company_number} · {r.address_snippet}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {r.company_status ?? "unknown"}
                </Badge>
                <Button size="sm" onClick={() => linkCompany(r)} disabled={linkingNumber !== null}>
                  {linkingNumber === r.company_number ? <Loader2 className="h-4 w-4 animate-spin" /> : "Link"}
                </Button>
              </div>
            </div>
          ))}
          {hasSearched && !searching && results.length === 0 && !error && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No companies found. Try a different name or the company number.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
