import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, CreditCard, Loader2, RefreshCw, AlertCircle, Settings } from "lucide-react";

const CompletePayment = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { organization, loading: orgLoading, refreshOrganization } = useOrganization();
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [billingStatus, setBillingStatus] = useState<string | null>(null);

  // Get org ID from context or localStorage fallback
  const getOrganizationId = (): string | null => {
    if (organization?.id) return organization.id;
    // Fallback to localStorage if org context hasn't loaded yet
    return localStorage.getItem("pending_org_id");
  };

  const getOrganizationName = (): string => {
    if (organization?.name) return organization.name;
    return "My Practice";
  };

  useEffect(() => {
    if (organization) {
      // Type assertion since billing_status is new
      const status = (organization as any).billing_status as string;
      setBillingStatus(status);
      
      // If already active, redirect to appropriate page
      if (status === 'active') {
        // Clear localStorage pending_org_id since we're done
        localStorage.removeItem("pending_org_id");
        
        if (organization.onboarding_completed) {
          navigate('/welcome');
        } else {
          navigate('/');
        }
      }
    }
  }, [organization, navigate]);

  const handleContinueToPayment = async () => {
    const orgId = getOrganizationId();
    const orgName = getOrganizationName();

    if (!orgId) {
      toast({
        title: "Error",
        description: "Organization not found. Please sign out and sign up again.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Edge function sets pending_checkout_session_id server-side
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: {
          organizationId: orgId,
          organizationName: orgName,
        },
      });

      if (error) throw error;

      if (data?.url) {
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

  // Use billing portal for past_due status to update payment method
  const handleManageSubscription = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (error: any) {
      toast({
        title: "Error opening billing portal",
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
          icon: <AlertCircle className="h-12 w-12 text-amber-500" />,
          iconBg: "bg-amber-100",
          title: "Payment Past Due",
          description: "Your last payment didn't go through. Please update your payment method to continue using AccountancyOS.",
          primaryAction: handleManageSubscription,
          primaryButtonText: "Update Payment Method",
          primaryButtonIcon: <Settings className="mr-2 h-4 w-4" />,
        };
      case 'canceled':
        return {
          icon: <AlertCircle className="h-12 w-12 text-muted-foreground" />,
          iconBg: "bg-muted",
          title: "Subscription Canceled",
          description: "Your subscription has been canceled. Resubscribe to regain access to AccountancyOS.",
          primaryAction: handleContinueToPayment,
          primaryButtonText: "Resubscribe",
          primaryButtonIcon: <CreditCard className="mr-2 h-4 w-4" />,
        };
      default:
        return {
          icon: <CreditCard className="h-12 w-12 text-primary" />,
          iconBg: "bg-primary/10",
          title: "Complete Your Subscription",
          description: "You're almost there! Complete your payment to start your 14-day free trial of AccountancyOS.",
          primaryAction: handleContinueToPayment,
          primaryButtonText: "Continue to Payment",
          primaryButtonIcon: <CreditCard className="mr-2 h-4 w-4" />,
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
          <div className={`flex justify-center p-3 rounded-full mx-auto w-fit ${statusInfo.iconBg}`}>
            {statusInfo.icon}
          </div>
          <CardTitle className="text-2xl">{statusInfo.title}</CardTitle>
          <CardDescription className="text-base">
            {statusInfo.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Button 
            onClick={statusInfo.primaryAction} 
            className="w-full" 
            size="lg"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {statusInfo.primaryButtonIcon}
                {statusInfo.primaryButtonText}
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
