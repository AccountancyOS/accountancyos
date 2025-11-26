import { useParams, useNavigate } from "react-router-dom";
import { useOrganization } from "@/lib/organization-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, CheckCircle } from "lucide-react";
import { format } from "date-fns";

const QuoteDetail = () => {
  const { id } = useParams();
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quote", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("quotes")
        .select(`
          *,
          lead:leads(first_name, last_name, email),
          client:clients(first_name, last_name, email),
          company:companies(company_name, email)
        `)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: lines } = useQuery({
    queryKey: ["quote-lines", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("quote_lines")
        .select(`
          *,
          service:services_catalog(name, code, billing_model)
        `)
        .eq("quote_id", id)
        .order("line_order");
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("quotes")
        .update({ status })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote", id] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      toast({ title: "Quote status updated" });
    },
  });

  if (isLoading) {
    return <div className="text-center py-12">Loading quote...</div>;
  }

  if (!quote) {
    return <div className="text-center py-12">Quote not found</div>;
  }

  const recipientName = quote.lead
    ? `${quote.lead.first_name} ${quote.lead.last_name}`
    : quote.client
    ? `${quote.client.first_name} ${quote.client.last_name}`
    : quote.company
    ? quote.company.company_name
    : "Unknown";

  const recipientEmail = quote.lead?.email || quote.client?.email || quote.company?.email;

  const statusColors = {
    draft: "secondary",
    sent: "default",
    accepted: "default",
    rejected: "destructive",
    expired: "secondary",
  } as const;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/quotes")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-semibold">Quote {quote.quote_number}</h1>
        </div>
        <Badge variant={statusColors[quote.status as keyof typeof statusColors]} className="text-sm">
          {quote.status.toUpperCase()}
        </Badge>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Quote Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Recipient</div>
                <div className="font-medium">{recipientName}</div>
                <div className="text-sm text-muted-foreground">{recipientEmail}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Created</div>
                <div className="font-medium">
                  {format(new Date(quote.created_at), "dd MMMM yyyy")}
                </div>
              </div>
              {quote.valid_until && (
                <div>
                  <div className="text-sm text-muted-foreground">Valid Until</div>
                  <div className="font-medium">
                    {format(new Date(quote.valid_until), "dd MMMM yyyy")}
                  </div>
                </div>
              )}
            </div>

            {quote.notes && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Notes</div>
                <div className="text-sm">{quote.notes}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lines?.map((line: any) => {
                const isMonthly = line.billing_frequency === "monthly";
                const displayPrice = isMonthly ? line.unit_price / 12 : line.unit_price;
                const displaySubtotal = isMonthly 
                  ? (line.quantity * displayPrice)
                  : line.subtotal;

                return (
                  <div key={line.id} className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium">{line.service.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {line.service.code} • {line.quantity} × £{displayPrice.toFixed(2)}
                        {isMonthly && "/month"}
                        <Badge variant="outline" className="ml-2">
                          {isMonthly ? "Monthly" : "Bill Now"}
                        </Badge>
                      </div>
                    </div>
                    <div className="font-medium">
                      £{displaySubtotal.toFixed(2)}
                      {isMonthly && <span className="text-sm text-muted-foreground">/mo</span>}
                    </div>
                  </div>
                );
              })}
              <Separator />
              
              {lines && lines.some((l: any) => l.billing_frequency === "now") && (
                <div className="flex justify-between items-center">
                  <div className="font-medium">Payable Now</div>
                  <div className="font-semibold">
                    £{lines
                      .filter((l: any) => l.billing_frequency === "now")
                      .reduce((sum: number, l: any) => sum + parseFloat(l.subtotal), 0)
                      .toFixed(2)}
                  </div>
                </div>
              )}

              {lines && lines.some((l: any) => l.billing_frequency === "monthly") && (
                <div className="flex justify-between items-center">
                  <div className="font-medium">Payable Monthly</div>
                  <div className="font-semibold">
                    £{lines
                      .filter((l: any) => l.billing_frequency === "monthly")
                      .reduce((sum: number, l: any) => sum + (parseFloat(l.unit_price) / 12 * l.quantity), 0)
                      .toFixed(2)}
                    <span className="text-sm text-muted-foreground">/mo</span>
                  </div>
                </div>
              )}

              <Separator />
              <div className="flex justify-between items-center text-lg font-semibold">
                <div>Total Amount</div>
                <div>£{quote.total_amount.toFixed(2)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {quote.status === "draft" && (
          <div className="flex gap-2">
            <Button
              onClick={() => updateStatusMutation.mutate("sent")}
              disabled={updateStatusMutation.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              Mark as Sent
            </Button>
          </div>
        )}

        {quote.status === "sent" && (
          <div className="flex gap-2">
            <Button
              onClick={() => updateStatusMutation.mutate("accepted")}
              disabled={updateStatusMutation.isPending}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark as Accepted
            </Button>
            <Button
              variant="outline"
              onClick={() => updateStatusMutation.mutate("rejected")}
              disabled={updateStatusMutation.isPending}
            >
              Mark as Rejected
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuoteDetail;
