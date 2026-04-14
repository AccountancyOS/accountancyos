import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CLIENT_TYPES,
  CLIENT_TYPE_LABELS,
  type ClientType,
} from "@/lib/client-types";

interface ClientTypeFiltersProps {
  activeType: ClientType | null;
  onTypeChange: (type: ClientType | null) => void;
  typeCounts: Record<string, number>;
}

export function ClientTypeFilters({
  activeType,
  onTypeChange,
  typeCounts,
}: ClientTypeFiltersProps) {
  const totalCount = Object.values(typeCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground mr-1">Type:</span>
      <Button
        variant={activeType === null ? "default" : "outline"}
        size="sm"
        onClick={() => onTypeChange(null)}
        className={cn(
          "transition-all",
          activeType === null && "ring-2 ring-primary/20"
        )}
      >
        All
        {totalCount > 0 && (
          <Badge
            variant={activeType === null ? "secondary" : "outline"}
            className="ml-2 h-5 min-w-[20px] px-1.5"
          >
            {totalCount}
          </Badge>
        )}
      </Button>
      {CLIENT_TYPES.map((type) => {
        const count = typeCounts[type] || 0;
        return (
          <Button
            key={type}
            variant={activeType === type ? "default" : "outline"}
            size="sm"
            onClick={() => onTypeChange(activeType === type ? null : type)}
            className={cn(
              "transition-all",
              activeType === type && "ring-2 ring-primary/20"
            )}
          >
            {CLIENT_TYPE_LABELS[type]}
            {count > 0 && (
              <Badge
                variant={activeType === type ? "secondary" : "outline"}
                className="ml-2 h-5 min-w-[20px] px-1.5"
              >
                {count}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}
