import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QuickFilter {
  id: string;
  label: string;
  count?: number;
}

interface JobsQuickFiltersProps {
  activeFilter: string | null;
  onFilterChange: (filterId: string | null) => void;
  jobCounts?: Record<string, number>;
}

const QUICK_FILTERS: QuickFilter[] = [
  { id: "my_jobs", label: "My Jobs" },
  { id: "overdue", label: "Overdue" },
  { id: "due_this_week", label: "Due This Week" },
  { id: "unassigned", label: "Unassigned" },
  { id: "records_requested", label: "Records Requested" },
  { id: "client_queries", label: "Client Queries" },
  { id: "accountant_review", label: "Accountant Review" },
];

export function JobsQuickFilters({ 
  activeFilter, 
  onFilterChange,
  jobCounts = {}
}: JobsQuickFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_FILTERS.map((filter) => (
        <Button
          key={filter.id}
          variant={activeFilter === filter.id ? "default" : "outline"}
          size="sm"
          onClick={() => onFilterChange(activeFilter === filter.id ? null : filter.id)}
          className={cn(
            "transition-all",
            activeFilter === filter.id && "ring-2 ring-primary/20"
          )}
        >
          {filter.label}
          {jobCounts[filter.id] !== undefined && jobCounts[filter.id] > 0 && (
            <Badge 
              variant={activeFilter === filter.id ? "secondary" : "outline"} 
              className="ml-2 h-5 min-w-[20px] px-1.5"
            >
              {jobCounts[filter.id]}
            </Badge>
          )}
        </Button>
      ))}
    </div>
  );
}
