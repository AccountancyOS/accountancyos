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
      // Scope to THIS client/company. engagement_letters links to the entity only
      // via onboarding_applications, so filter through that relationship with an
      // inner join. `as any` keeps the embedded-select off the deep type recursion.
      let query = supabase
        .from("engagement_letters")
        .select("signed_at, onboarding_applications!inner(client_id, company_id)")
        .not("signed_at", "is", null)
        .order("signed_at", { ascending: false })
        .limit(1);

      if (clientId) {
        query = query.eq("onboarding_applications.client_id", clientId);
      } else if (companyId) {
        query = query.eq("onboarding_applications.company_id", companyId);
      }

      const { data, error } = await query as any;

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
