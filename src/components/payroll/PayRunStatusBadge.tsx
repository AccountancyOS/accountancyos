import { Badge } from "@/components/ui/badge";
import { 
  PAY_RUN_STATUS_LABELS, 
  PAY_RUN_STATUS_COLORS,
  type PayRunStatus 
} from "@/lib/payroll-constants";
import { cn } from "@/lib/utils";

interface PayRunStatusBadgeProps {
  status: PayRunStatus;
  className?: string;
}

export function PayRunStatusBadge({ status, className }: PayRunStatusBadgeProps) {
  const label = PAY_RUN_STATUS_LABELS[status] || status;
  const colorClass = PAY_RUN_STATUS_COLORS[status] || PAY_RUN_STATUS_COLORS.draft;

  return (
    <Badge 
      variant="outline" 
      className={cn(colorClass, className)}
    >
      {label}
    </Badge>
  );
}
