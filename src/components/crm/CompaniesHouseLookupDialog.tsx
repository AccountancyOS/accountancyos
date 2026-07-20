import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Building2, CheckCircle } from "lucide-react";
import { searchCompaniesHouse, getCompanyProfile, type CHSearchResult, type CHCompanyProfile } from "@/lib/companies-house-lookup";
import { useToast } from "@/hooks/use-toast";

interface CompaniesHouseLookupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  onCompanySelected: (profile: CHCompanyProfile) => void;
}

export function CompaniesHouseLookupDialog({
  open,
  onOpenChange,
  initialQuery = "",
  onCompanySelected,
}: CompaniesHouseLookupDialogProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CHSearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loadingProfile, setLoadingProfile] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    setResults([]);

    const { data, error } = await searchCompaniesHouse(searchQuery);

    if (error) {
      toast({
        title: "Search failed",
        description: error,
        variant: "destructive",
      });
    } else if (data) {
      setResults(data.items || []);
      setTotalResults(data.total_results || 0);
    }

    setSearching(false);
  };

  const handleSelectCompany = async (company: CHSearchResult) => {
    setLoadingProfile(company.company_number);

    const { data, error } = await getCompanyProfile(company.company_number);

    if (error) {
      toast({
        title: "Failed to load company details",
        description: error,
        variant: "destructive",
      });
      setLoadingProfile(null);
      return;
    }

    if (data) {
      onCompanySelected(data);
      onOpenChange(false);
    }

    setLoadingProfile(null);
  };

  const getStatusColor = (status?: string | null) => {
    switch ((status ?? "").toLowerCase()) {
      case "active":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "dissolved":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
      case "liquidation":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Companies House Lookup
          </DialogTitle>
          <DialogDescription>
            Search for a company to auto-populate details
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Search by company name or number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            autoFocus
          />
          <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0 max-h-[400px]">
          {results.length > 0 ? (
            <div className="space-y-2 pr-4">
              <p className="text-sm text-muted-foreground mb-3">
                {totalResults} result{totalResults !== 1 ? "s" : ""} found
              </p>
              {results.map((company) => (
                <div
                  key={company.company_number}
                  className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleSelectCompany(company)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{company.title}</p>
                        {loadingProfile === company.company_number && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {company.company_number}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {company.address_snippet}
                      </p>
                    </div>
                    <Badge className={getStatusColor(company.company_status)}>
                      {company.company_status ?? "unknown"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : searching ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-2" />
              <p>Searching Companies House...</p>
            </div>
          ) : searchQuery && !searching && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Building2 className="h-8 w-8 mb-2 opacity-50" />
              <p>No companies found</p>
              <p className="text-sm">Try a different search term</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Search className="h-8 w-8 mb-2 opacity-50" />
              <p>Enter a company name or number to search</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
