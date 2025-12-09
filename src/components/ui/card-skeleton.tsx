import { Skeleton } from "./skeleton";
import { Card, CardContent, CardHeader } from "./card";

interface CardSkeletonProps {
  hasHeader?: boolean;
  lines?: number;
}

export function CardSkeleton({ hasHeader = true, lines = 3 }: CardSkeletonProps) {
  return (
    <Card className="animate-fade-in">
      {hasHeader && (
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
      )}
      <CardContent className={hasHeader ? "" : "pt-6"}>
        <div className="space-y-3">
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" style={{ width: `${100 - i * 15}%` }} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
