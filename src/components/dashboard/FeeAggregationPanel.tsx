import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/lib/organization-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PoundSterling, TrendingUp, Repeat, Zap } from "lucide-react";

interface FeeData {
  monthly: number;
  oneOff: number;
  total: number;
  byService: Array<{ name: string; code: string; total: number; count: number }>;
}

export function FeeAggregationPanel() {
  const { organization } = useOrganization();

  const { data: feeData, isLoading } = useQuery({
    queryKey: ["fee-aggregation", organization?.id],
    queryFn: async (): Promise<FeeData> => {
      if (!organization?.id) return { monthly: 0, oneOff: 0, total: 0, byService: [] };

      // Get all active engagements with their service details
      const { data: engagements, error } = await supabase
        .from("engagements")
        .select(`
          fee_amount,
          fee_frequency,
          services_catalog!inner(name, code, billing_model)
        `)
        .eq("organization_id", organization.id)
        .eq("status", "active");

      if (error) throw error;

      let monthly = 0;
      let oneOff = 0;
      const serviceMap = new Map<string, { name: string; code: string; total: number; count: number }>();

      for (const eng of engagements || []) {
        const fee = eng.fee_amount || 0;
        const service = eng.services_catalog as any;
        const freq = eng.fee_frequency || service?.billing_model || "fixed";

        // Normalize to monthly for recurring
        let monthlyEquivalent = 0;
        if (freq === "monthly") {
          monthly += fee;
          monthlyEquivalent = fee;
        } else if (freq === "quarterly") {
          monthly += fee / 3;
          monthlyEquivalent = fee / 3;
        } else if (freq === "annually" || freq === "fixed") {
          oneOff += fee;
          monthlyEquivalent = 0;
        }

        // Aggregate by service
        const key = service?.code || "unknown";
        const existing = serviceMap.get(key) || { name: service?.name || "Unknown", code: key, total: 0, count: 0 };
        existing.total += fee;
        existing.count += 1;
        serviceMap.set(key, existing);
      }

      const byService = Array.from(serviceMap.values()).sort((a, b) => b.total - a.total);

      return { monthly, oneOff, total: monthly * 12 + oneOff, byService };
    },
    enabled: !!organization?.id,
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PoundSterling className="h-5 w-5" />
          Fee Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fee breakdown */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
              <Repeat className="h-3 w-3" />
              Monthly Recurring
            </div>
            <p className="text-lg font-semibold">{formatCurrency(feeData?.monthly || 0)}</p>
            <p className="text-xs text-muted-foreground">/month</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
              <Zap className="h-3 w-3" />
              One-Off / Annual
            </div>
            <p className="text-lg font-semibold">{formatCurrency(feeData?.oneOff || 0)}</p>
            <p className="text-xs text-muted-foreground">total</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3 w-3" />
              Annualised Total
            </div>
            <p className="text-lg font-semibold">{formatCurrency(feeData?.total || 0)}</p>
            <p className="text-xs text-muted-foreground">/year</p>
          </div>
        </div>

        {/* Revenue by service */}
        {feeData?.byService && feeData.byService.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2">Revenue by Service</h4>
              <div className="space-y-2">
                {feeData.byService.slice(0, 8).map((service) => (
                  <div key={service.code} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{service.name}</span>
                      <Badge variant="secondary" className="text-xs">{service.count} clients</Badge>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(service.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
