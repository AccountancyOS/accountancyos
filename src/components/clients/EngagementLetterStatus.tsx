import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { format } from "date-fns";

interface EngagementLetterStatusProps {
  clientId?: string;
  companyId?: string;
}

export function EngagementLetterStatus({ clientId, companyId }: EngagementLetterStatusProps) {
  const { data: lastSignedDate } = useQuery({
    queryKey: ["el-last-signed", clientId, companyId],
    queryFn: async (): Promise<string | null> => {
      // Use a raw filter approach to avoid deep type recursion
      const { data, error } = await supabase
        .from("engagement_letters")
        .select("signed_at")
        .not("signed_at", "is", null)
        .order("signed_at", { ascending: false })
        .limit(1) as any;

      if (error) throw error;
      return data?.[0]?.signed_at || null;
    },
    enabled: !!(clientId || companyId),
  });

  return (
    <div className="flex items-center gap-2">
      <FileText className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Engagement Letter:</span>
      {lastSignedDate ? (
        <Badge variant="outline" className="text-xs">
          Signed {format(new Date(lastSignedDate), "d MMM yyyy")}
        </Badge>
      ) : (
        <Badge variant="secondary" className="text-xs">Not signed</Badge>
      )}
    </div>
  );
}
