import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BookkeepingEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function BookkeepingEmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: BookkeepingEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-[400px] border border-dashed rounded-lg bg-muted/5">
      <div className="flex flex-col items-center text-center space-y-4 max-w-md px-4">
        <div className="rounded-full bg-muted/50 p-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actionLabel && onAction && (
          <Button onClick={onAction} className="mt-2">
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
