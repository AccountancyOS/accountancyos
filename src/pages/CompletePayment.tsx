import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/lib/app-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, CreditCard, Loader2, RefreshCw, AlertCircle, Settings, LogOut, Check, Users, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";

type PaymentMode = 'new_trial' | 'reactivate' | 'past_due' | 'canceled' | 'unknown';
type PrimaryAction = 'checkout' | 'billing_portal';
type Plan = 'solo' | 'team' | 'scale';

interface PlanOption {
  id: Plan;
  name: string;
  price: number;
  userLimit: string;
  features: string[];
  icon: React.ReactNode;
  popular?: boolean;
}

const PLANS: PlanOption[] = [
  {
    id: 'solo',
    name: 'Solo',
    price: 199,
    userLimit: '1 user',
    features: ['All features included', 'Unlimited clients', 'Email & chat support'],
    icon: <CreditCard className="h-5 w-5" />,
  },
  {
    id: 'team',
    name: 'Team',
    price: 299,
    userLimit: '2-4 users',
    features: ['All features included', 'Unlimited clients', 'Priority support'],
    icon: <Users className="h-5 w-5" />,
    popular: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 599,
    userLimit: '5-10 users',
    features: ['All features included', 'Unlimited clients', 'Dedicated support'],
    icon: <Rocket className="h-5 w-5" />,
  },
];

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
    title: "Choose your plan",
    description: "Start your 14-day free trial. No charge until your trial ends.",
    primaryText: "Start free trial",
    primaryAction: "checkout",
  },
  reactivate: {
    icon: <RefreshCw className="h-12 w-12 text-blue-500" />,
    iconBg: "bg-blue-100",
    title: "Choose a plan to reactivate",
    description: "Select a plan to regain access to your AccountancyOS workspace.",
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
    title: "Choose a plan to resubscribe",
    description: "Your subscription has ended. Select a plan to regain access to AccountancyOS.",
    primaryText: "Resubscribe",
    primaryAction: "checkout",
  },
};

const CompletePayment = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, organization, organizationLoading: orgLoading, refreshOrganization } = useApp();
  
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan>('team');
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
      const status = organization.billing_status;
      
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
  const billingStatus = organization?.billing_status;
  
  const hasSubscriptionHistory = Boolean(
    subscriptionCache?.subscription_id || 
    organization?.stripe_subscription_id
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

  const showPlanSelection = mode !== 'past_due' && mode !== 'unknown';

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
          plan: selectedPlan,
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
  const selectedPlanDetails = PLANS.find(p => p.id === selectedPlan);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-accent/20 p-4">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="bg-primary p-2 rounded-lg">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-3xl font-bold">{uiConfig.title}</h1>
          <p className="text-muted-foreground text-lg">{uiConfig.description}</p>
        </div>

        {/* Plan Selection */}
        {showPlanSelection && (
          <div className="grid md:grid-cols-3 gap-4">
            {PLANS.map((plan) => (
              <Card 
                key={plan.id}
                className={cn(
                  "relative cursor-pointer transition-all hover:shadow-md",
                  selectedPlan === plan.id 
                    ? "border-primary ring-2 ring-primary/20" 
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => setSelectedPlan(plan.id)}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className={cn(
                      "p-2 rounded-lg",
                      selectedPlan === plan.id ? "bg-primary/10" : "bg-muted"
                    )}>
                      {plan.icon}
                    </div>
                    {selectedPlan === plan.id && (
                      <div className="bg-primary rounded-full p-1">
                        <Check className="h-4 w-4 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.userLimit}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">£{plan.price}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <p className="text-xs text-muted-foreground">+ VAT</p>
                  </div>
                  <div className="font-medium text-sm bg-muted px-3 py-2 rounded-md">
                    {plan.userLimit}
                  </div>
                  <ul className="space-y-2">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Action Card */}
        <Card className="shadow-lg">
          <CardContent className="pt-6 space-y-4">
            {!showPlanSelection && (
              <div className={`flex justify-center p-3 rounded-full mx-auto w-fit ${uiConfig.iconBg}`}>
                {uiConfig.icon}
              </div>
            )}

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
                  {showPlanSelection && selectedPlanDetails
                    ? `${uiConfig.primaryText} - ${selectedPlanDetails.name} (£${selectedPlanDetails.price}/mo)`
                    : uiConfig.primaryText
                  }
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
    </div>
  );
};

export default CompletePayment;
