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
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_last_el_signed_date", {
        p_client_id: clientId || null,
        p_company_id: companyId || null,
      });
      if (error) throw error;
      return data as string | null;
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
