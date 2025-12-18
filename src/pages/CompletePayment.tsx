import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useOrganization } from "@/lib/organization-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, CreditCard, Loader2, RefreshCw, AlertCircle, Settings, LogOut } from "lucide-react";

type PaymentMode = 'new_trial' | 'reactivate' | 'past_due' | 'canceled' | 'unknown';
type PrimaryAction = 'checkout' | 'billing_portal';

interface UIConfig {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  primaryText: string;
  primaryAction: PrimaryAction;
}

const UI_BY_MODE: Record<Exclude<PaymentMode, 'unknown'>, UIConfig> = {
  new_trial: {
    icon: <CreditCard className="h-12 w-12 text-primary" />,
    iconBg: "bg-primary/10",
    title: "Start your free trial",
    description: "Complete setup to start your 14-day free trial and unlock your AccountancyOS workspace.",
    primaryText: "Continue to payment",
    primaryAction: "checkout",
  },
  reactivate: {
    icon: <RefreshCw className="h-12 w-12 text-blue-500" />,
    iconBg: "bg-blue-100",
    title: "Reactivate your subscription",
    description: "This workspace previously had an active subscription. Resubscribe to regain access.",
    primaryText: "Resubscribe",
    primaryAction: "checkout",
  },
  past_due: {
    icon: <AlertCircle className="h-12 w-12 text-amber-500" />,
    iconBg: "bg-amber-100",
    title: "Payment failed",
    description: "Your last payment didn't go through. Update your payment method to continue using AccountancyOS.",
    primaryText: "Update payment method",
    primaryAction: "billing_portal",
  },
  canceled: {
    icon: <AlertCircle className="h-12 w-12 text-muted-foreground" />,
    iconBg: "bg-muted",
    title: "Subscription canceled",
    description: "Your subscription has ended. Resubscribe to regain access to AccountancyOS.",
    primaryText: "Resubscribe",
    primaryAction: "checkout",
  },
};

const CompletePayment = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { organization, loading: orgLoading, refreshOrganization } = useOrganization();
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [subscriptionCache, setSubscriptionCache] = useState<{
    subscription_id: string | null;
    subscription_status: string | null;
  } | null>(null);
  const [cacheLoading, setCacheLoading] = useState(true);

  // Fetch subscription cache to determine if org ever had a subscription
  useEffect(() => {
    const fetchSubscriptionHistory = async () => {
      if (!organization?.id) {
        setCacheLoading(false);
        return;
      }
      
      try {
        const { data } = await supabase
          .from('organization_subscription_cache')
          .select('subscription_id, subscription_status')
          .eq('organization_id', organization.id)
          .maybeSingle();
        
        setSubscriptionCache(data);
      } catch (error) {
        console.error('Error fetching subscription cache:', error);
      } finally {
        setCacheLoading(false);
      }
    };
    
    fetchSubscriptionHistory();
  }, [organization?.id]);

  // Redirect if billing becomes active
  useEffect(() => {
    if (organization) {
      const status = (organization as any).billing_status as string;
      
      if (status === 'active') {
        localStorage.removeItem("pending_org_id");
        
        if (organization.onboarding_completed) {
          navigate('/welcome');
        } else {
          navigate('/onboarding-wizard');
        }
      }
    }
  }, [organization, navigate]);

  // Compute billing status and payment mode
  const billingStatus = (organization as any)?.billing_status as string | undefined;
  
  const hasSubscriptionHistory = Boolean(
    subscriptionCache?.subscription_id || 
    (organization as any)?.stripe_subscription_id
  );

  const mode: PaymentMode = (() => {
    if (billingStatus === 'past_due') return 'past_due';
    if (billingStatus === 'canceled') return 'canceled';
    
    // Anything not active (null/undefined/pending_payment)
    if (billingStatus !== 'active') {
      return hasSubscriptionHistory ? 'reactivate' : 'new_trial';
    }
    
    return 'unknown';
  })();

  // Get org ID from context or localStorage fallback
  const getOrganizationId = (): string | null => {
    if (organization?.id) return organization.id;
    return localStorage.getItem("pending_org_id");
  };

  const getOrganizationName = (): string => {
    if (organization?.name) return organization.name;
    return "My Practice";
  };

  const handleCheckout = async () => {
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
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: {
          organizationId: orgId,
          organizationName: orgName,
          intent: mode === 'new_trial' ? 'trial' : 'reactivate',
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

  const handleBillingPortal = async () => {
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

  const handlePrimaryAction = () => {
    if (mode === 'unknown') return;
    
    const config = UI_BY_MODE[mode];
    if (config.primaryAction === 'billing_portal') {
      handleBillingPortal();
    } else {
      handleCheckout();
    }
  };

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke('check-subscription', {
        body: { forceRefresh: true },
      });

      if (error) {
        console.error('Refresh error:', error);
      }

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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("pending_org_id");
    navigate("/auth");
  };

  if (orgLoading || cacheLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Defensive: shouldn't render for unknown mode
  if (mode === 'unknown') {
    return null;
  }

  const uiConfig = UI_BY_MODE[mode];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-4 pb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="bg-primary p-2 rounded-lg">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <div className={`flex justify-center p-3 rounded-full mx-auto w-fit ${uiConfig.iconBg}`}>
            {uiConfig.icon}
          </div>
          <CardTitle className="text-2xl">{uiConfig.title}</CardTitle>
          <CardDescription className="text-base">
            {uiConfig.description}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Button 
            onClick={handlePrimaryAction} 
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
                {uiConfig.primaryAction === 'billing_portal' ? (
                  <Settings className="mr-2 h-4 w-4" />
                ) : (
                  <CreditCard className="mr-2 h-4 w-4" />
                )}
                {uiConfig.primaryText}
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

          <Button
            onClick={handleSignOut}
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out or switch account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompletePayment;
