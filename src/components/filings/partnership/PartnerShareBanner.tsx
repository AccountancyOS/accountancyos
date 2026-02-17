/**
 * PartnerShareBanner — displays partnership allocation info on individual SA returns.
 * Shows the referenced partnership return and the partner's computed share.
 * This is reference-based: always reads the latest allocation values.
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { getPartnerShareForFiling } from "@/lib/partnership-engine";

interface Props {
  filingId: string;
}

export function PartnerShareBanner({ filingId }: Props) {
  const navigate = useNavigate();

  const { data: allocation, isLoading } = useQuery({
    queryKey: ["partner-share", filingId],
    queryFn: () => getPartnerShareForFiling(filingId),
    enabled: !!filingId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading partnership data…
        </CardContent>
      </Card>
    );
  }

  if (!allocation) return null;

  const partnershipFiling = allocation.filing as any;
  const partnershipName = partnershipFiling?.draft_schedule_data_json?.partnership?.partnership_name || 'Partnership';

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">
                Partnership Share: {partnershipName}
              </p>
              <p className="text-xs text-muted-foreground">
                {allocation.allocation_method === 'percentage'
                  ? `${allocation.percentage}% share`
                  : allocation.allocation_method === 'fixed'
                  ? `Fixed allocation`
                  : 'Special allocation'
                }
                {' • '}
                Profit share: £{Number(allocation.computed_profit_share).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Reference-linked
            </Badge>
            {partnershipFiling?.id && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigate(`/filings/${partnershipFiling.id}`)}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1" />
                View Partnership
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
