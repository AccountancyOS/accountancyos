import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, CreditCard, Loader2, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

const CompletePayment = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { organization, loading: orgLoading, refreshOrganization } = useOrganization();
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [billingStatus, setBillingStatus] = useState<string | null>(null);

  useEffect(() => {
    if (organization) {
      // Type assertion since billing_status is new
      const status = (organization as any).billing_status as string;
      setBillingStatus(status);
      
      // If already active, redirect to appropriate page
      if (status === 'active') {
        if (organization.onboarding_completed) {
          navigate('/welcome');
        } else {
          navigate('/onboarding-wizard');
        }
      }
    }
  }, [organization, navigate]);

  const handleContinueToPayment = async () => {
    if (!organization) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: {
          organizationId: organization.id,
          organizationName: organization.name,
        },
      });

      if (error) throw error;

      if (data?.url) {
        // Store pending session ID
        await supabase
          .from('organizations')
          .update({ pending_checkout_session_id: data.sessionId })
          .eq('id', organization.id);

        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error: any) {
      toast({
        title: "Error starting checkout",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      // Call check-subscription to force refresh from Stripe
      const { error } = await supabase.functions.invoke('check-subscription', {
        body: { forceRefresh: true },
      });

      if (error) {
        console.error('Refresh error:', error);
      }

      // Refresh local org data
      await refreshOrganization();

      toast({
        title: "Status refreshed",
        description: "Your subscription status has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Error refreshing status",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  if (orgLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const getStatusInfo = () => {
    switch (billingStatus) {
      case 'past_due':
        return {
          icon: <AlertCircle className="h-12 w-12 text-destructive" />,
          title: "Payment Failed",
          description: "Your last payment didn't go through. Please update your payment method to continue using AccountancyOS.",
          buttonText: "Update Payment Method",
        };
      case 'canceled':
        return {
          icon: <AlertCircle className="h-12 w-12 text-muted-foreground" />,
          title: "Subscription Canceled",
          description: "Your subscription has been canceled. Resubscribe to regain access to AccountancyOS.",
          buttonText: "Resubscribe",
        };
      default:
        return {
          icon: <CreditCard className="h-12 w-12 text-primary" />,
          title: "Complete Your Subscription",
          description: "You're almost there! Complete your payment to start using AccountancyOS.",
          buttonText: "Continue to Payment",
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4 pb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="bg-primary p-2 rounded-lg">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <div className="flex justify-center">
            {statusInfo.icon}
          </div>
          <CardTitle className="text-2xl">{statusInfo.title}</CardTitle>
          <CardDescription className="text-base">
            {statusInfo.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Button 
            onClick={handleContinueToPayment} 
            className="w-full" 
            size="lg"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                {statusInfo.buttonText}
              </>
            )}
          </Button>

          <Button
            onClick={handleRefreshStatus}
            variant="outline"
            className="w-full"
            disabled={refreshing}
          >
            {refreshing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Already paid? Refresh status
              </>
            )}
          </Button>

          <div className="text-center pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">
              Need help? Contact us at
            </p>
            <a 
              href="mailto:support@accountancyos.com" 
              className="text-sm text-primary hover:underline"
            >
              support@accountancyos.com
            </a>
          </div>

          {organization && (
            <div className="text-xs text-muted-foreground text-center pt-2 border-t">
              <p>Organization: {organization.name}</p>
              <p>Status: {billingStatus || 'pending_payment'}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CompletePayment;
