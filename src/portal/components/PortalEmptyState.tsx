import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface PortalEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function PortalEmptyState({ icon: Icon, title, description }: PortalEmptyStateProps) {
  return (
    <Card>
      <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}