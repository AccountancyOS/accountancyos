import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Users, ArrowRight, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { AllotSharesDialog } from "./AllotSharesDialog";
import { TransferSharesDialog } from "./TransferSharesDialog";

interface ShareholdersSectionProps {
  companyId: string;
  organizationId: string;
}

export function ShareholdersSection({ companyId, organizationId }: ShareholdersSectionProps) {
  const [showAllotDialog, setShowAllotDialog] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("cap-table");

  // Fetch shareholders with person details
  const { data: shareholders, isLoading } = useQuery({
    queryKey: ["company-shareholders", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_shareholders")
        .select(`
          id,
          shares_held,
          as_at_date,
          share_class:company_share_classes(id, class_name, nominal_value, currency),
          person:company_persons(id, title, first_name, last_name)
        `)
        .eq("company_id", companyId)
        .gt("shares_held", 0)
        .order("shares_held", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch allotments
  const { data: allotments } = useQuery({
    queryKey: ["company-allotments", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_share_allotments")
        .select(`
          id,
          shares_allotted,
          price_per_share,
          total_consideration,
          allotment_date,
          share_class:company_share_classes(id, class_name),
          shareholder:company_shareholders(
            id,
            person:company_persons(id, first_name, last_name)
          )
        `)
        .eq("company_id", companyId)
        .order("allotment_date", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
  });

  // Fetch transfers
  const { data: transfers } = useQuery({
    queryKey: ["company-transfers", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_share_transfers")
        .select(`
          id,
          shares_transferred,
          transfer_date,
          consideration,
          share_class:company_share_classes(id, class_name),
          from_shareholder:company_shareholders!company_share_transfers_from_shareholder_id_fkey(
            id,
            person:company_persons(id, first_name, last_name)
          ),
          to_shareholder:company_shareholders!company_share_transfers_to_shareholder_id_fkey(
            id,
            person:company_persons(id, first_name, last_name)
          )
        `)
        .eq("company_id", companyId)
        .order("transfer_date", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
  });

  // Calculate totals per shareholder
  const totalShares = shareholders?.reduce((sum, s) => sum + Number(s.shares_held || 0), 0) || 0;

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading shareholders...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              Shareholders & Cap Table
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowTransferDialog(true)}>
                <ArrowRight className="h-4 w-4 mr-1" />
                Transfer
              </Button>
              <Button size="sm" onClick={() => setShowAllotDialog(true)}>
                <TrendingUp className="h-4 w-4 mr-1" />
                Allot Shares
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="cap-table">Cap Table</TabsTrigger>
              <TabsTrigger value="allotments">Allotments</TabsTrigger>
              <TabsTrigger value="transfers">Transfers</TabsTrigger>
            </TabsList>

            <TabsContent value="cap-table">
              {!shareholders || shareholders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No shareholders registered. Allot shares to record shareholdings.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shareholder</TableHead>
                      <TableHead>Share Class</TableHead>
                      <TableHead className="text-right">Shares Held</TableHead>
                      <TableHead className="text-right">% Ownership</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>As At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shareholders.map((sh) => (
                      <TableRow key={sh.id}>
                        <TableCell className="font-medium">
                          {sh.person?.title} {sh.person?.first_name} {sh.person?.last_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{sh.share_class?.class_name}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(sh.shares_held).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {totalShares > 0 ? ((Number(sh.shares_held) / totalShares) * 100).toFixed(2) : 0}%
                        </TableCell>
                        <TableCell className="text-right">
                          {sh.share_class?.currency} {(Number(sh.shares_held) * Number(sh.share_class?.nominal_value || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          {sh.as_at_date && format(new Date(sh.as_at_date), "dd MMM yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="allotments">
              {!allotments || allotments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No allotments recorded.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Shareholder</TableHead>
                      <TableHead>Share Class</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">Price/Share</TableHead>
                      <TableHead className="text-right">Consideration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allotments.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          {a.allotment_date && format(new Date(a.allotment_date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell className="font-medium">
                          {a.shareholder?.person?.first_name} {a.shareholder?.person?.last_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{a.share_class?.class_name}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(a.shares_allotted).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {a.price_per_share ? `£${Number(a.price_per_share).toFixed(4)}` : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {a.total_consideration ? `£${Number(a.total_consideration).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="transfers">
              {!transfers || transfers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No transfers recorded.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Share Class</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">Consideration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transfers.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          {t.transfer_date && format(new Date(t.transfer_date), "dd MMM yyyy")}
                        </TableCell>
                        <TableCell>
                          {t.from_shareholder?.person?.first_name} {t.from_shareholder?.person?.last_name}
                        </TableCell>
                        <TableCell className="font-medium">
                          {t.to_shareholder?.person?.first_name} {t.to_shareholder?.person?.last_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{t.share_class?.class_name}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(t.shares_transferred).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.consideration ? `£${Number(t.consideration).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <AllotSharesDialog
        open={showAllotDialog}
        onOpenChange={setShowAllotDialog}
        companyId={companyId}
        organizationId={organizationId}
      />

      <TransferSharesDialog
        open={showTransferDialog}
        onOpenChange={setShowTransferDialog}
        companyId={companyId}
      />
    </div>
  );
}
