import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, Calendar, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useState } from "react";

export default function Subscription() {
  const { subscribed, subscriptionEnd, checkingSubscription, checkSubscription, session } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleManageSubscription = async () => {
    if (!session) {
      toast.error("Please sign in to manage your subscription");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      if (data.url) {
        window.open(data.url, '_blank');
      }
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast.error("Failed to open subscription management portal");
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    await checkSubscription();
    toast.success("Subscription status refreshed");
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Subscription</h1>
          <p className="text-muted-foreground mt-2">
            Manage your AccountancyOS subscription and billing
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Current Plan
                </CardTitle>
                <CardDescription>Your subscription status and details</CardDescription>
              </div>
              <Badge variant={subscribed ? "default" : "secondary"}>
                {subscribed ? "Active" : "Inactive"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {checkingSubscription ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className={`h-5 w-5 mt-0.5 ${subscribed ? 'text-green-600' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="font-medium">
                        {subscribed ? "AccountancyOS Pro" : "No Active Subscription"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {subscribed 
                          ? "Full access to all features" 
                          : "Subscribe to unlock all features"}
                      </p>
                    </div>
                  </div>

                  {subscribed && subscriptionEnd && (
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 mt-0.5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Next Billing Date</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(subscriptionEnd), "PPP")}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  {subscribed && (
                    <Button 
                      onClick={handleManageSubscription} 
                      disabled={loading}
                      className="flex-1"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Opening Portal...
                        </>
                      ) : (
                        "Manage Subscription"
                      )}
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    onClick={handleRefreshStatus}
                    disabled={checkingSubscription}
                  >
                    {checkingSubscription ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Checking...
                      </>
                    ) : (
                      "Refresh Status"
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Billing Information</CardTitle>
            <CardDescription>
              Manage your payment methods and view billing history
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Use the "Manage Subscription" button above to update payment methods, 
              view invoices, and manage your billing details through Stripe's secure portal.
            </p>
            {subscribed && (
              <p className="text-sm text-muted-foreground">
                Your subscription includes a 14-day free trial. You won't be charged until 
                the trial period ends.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
