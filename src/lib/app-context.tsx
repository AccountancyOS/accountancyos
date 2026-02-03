import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback, useMemo } from "react";
import { User, Session, RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { BillingStatus } from "@/types/billing";

// ==================== TYPES ====================

export type AppRole = "owner" | "admin" | "manager" | "staff" | "viewer";

export interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  onboarding_completed: boolean;
  setup_dismissed: boolean;
  timezone: string | null;
  email_domain: string | null;
  billing_status: BillingStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface SubscriptionCache {
  subscribed: boolean;
  subscription_end: string | null;
  subscription_status: string | null;
  checked_at: string;
}

export interface AppContextType {
  // Auth
  user: User | null;
  session: Session | null;
  loading: boolean;
  
  // Organization
  organization: Organization | null;
  role: AppRole | null;
  organizationLoading: boolean;
  organizationError: string | null;
  
  // Subscription
  subscribed: boolean;
  subscriptionEnd: string | null;
  checkingSubscription: boolean;
  
  // Actions
  signOut: () => Promise<void>;
  refreshOrganization: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const defaultContext: AppContextType = {
  user: null,
  session: null,
  loading: true,
  organization: null,
  role: null,
  organizationLoading: true,
  organizationError: null,
  subscribed: false,
  subscriptionEnd: null,
  checkingSubscription: false,
  signOut: async () => {},
  refreshOrganization: async () => {},
  checkSubscription: async () => {},
};

const AppContext = createContext<AppContextType>(defaultContext);

export const useApp = () => useContext(AppContext);

// ==================== SINGLE-FLIGHT SUBSCRIPTION CHECK ====================

// Module-level deduplication for subscription checks
let inFlightSubscriptionCheck: Promise<{ subscribed: boolean; subscriptionEnd: string | null }> | null = null;
let subscriptionResultCache: { value: { subscribed: boolean; subscriptionEnd: string | null }; ts: number } | null = null;
const SUBSCRIPTION_CACHE_TTL = 15000; // 15 seconds

// ==================== STRIPE CHECK OPTIMIZATION ====================

/**
 * Determines if we should skip the Stripe API check entirely.
 * Returns true when we know for certain the user has no active subscription
 * without needing to call Stripe.
 */
const shouldSkipStripeCheck = (org: Organization | null): boolean => {
  if (!org) return true;
  
  // If there's a recent Stripe return guard, we need to check Stripe
  const stripeReturnTs = localStorage.getItem("stripe_return_ts");
  if (stripeReturnTs) {
    const STRIPE_RETURN_GUARD_TTL = 2 * 60 * 1000; // 2 minutes
    const returnAge = Date.now() - parseInt(stripeReturnTs, 10);
    if (returnAge < STRIPE_RETURN_GUARD_TTL) {
      return false; // Recent Stripe return - need to verify
    }
  }
  
  // If billing is active, we may need to verify subscription details
  if (org.billing_status === 'active') {
    return false;
  }
  
  // If there's no stripe_customer_id, user never completed Stripe checkout
  // No point calling Stripe API - they definitely don't have a subscription
  if (!org.stripe_customer_id) {
    console.log("[App] Skipping Stripe check - no stripe_customer_id");
    return true;
  }
  
  // User has a stripe_customer_id but billing isn't active
  // Could be past_due, canceled, etc. - need to check Stripe for latest status
  return false;
};

// ==================== PROVIDER ====================

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Organization state
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [organizationLoading, setOrganizationLoading] = useState(true);
  const [organizationError, setOrganizationError] = useState<string | null>(null);
  
  // Subscription state
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  
  // Realtime channel ref
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);

  // ==================== LOAD ORGANIZATION ====================
  
  const loadOrganization = useCallback(async (userId: string) => {
    setOrganizationLoading(true);
    setOrganizationError(null);
    
    try {
      const { data, error } = await supabase
        .from("organization_users")
        .select(`
          organization_id,
          role,
          organization:organizations(
            id, 
            name, 
            logo_url, 
            onboarding_completed,
            setup_dismissed,
            timezone, 
            email_domain,
            billing_status,
            stripe_customer_id,
            stripe_subscription_id
          )
        `)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("[App] Error loading organization:", error);
        setOrganizationError("Failed to load organization data");
        setOrganization(null);
        setRole(null);
        return null;
      }

      if (data && data.organization) {
        const org = data.organization as unknown as Organization;
        setOrganization(org);
        setRole(data.role as AppRole);
        return org.id;
      } else {
        // User has no organization yet
        setOrganization(null);
        setRole(null);
        return null;
      }
    } catch (err) {
      console.error("[App] Error loading organization:", err);
      setOrganization(null);
      setRole(null);
      return null;
    } finally {
      setOrganizationLoading(false);
    }
  }, []);

  // ==================== SUBSCRIPTION CHECK (SINGLE-FLIGHT) ====================
  
  const readSubscriptionFromCache = useCallback(async (orgId: string): Promise<boolean> => {
    try {
      const { data: cache, error } = await supabase
        .from('organization_subscription_cache')
        .select('subscribed, subscription_end, subscription_status, checked_at')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (error || !cache) {
        return false;
      }

      const now = new Date();
      const checkedAt = new Date(cache.checked_at);
      const cacheMaxAge = 15 * 60 * 1000; // 15 minutes
      const cacheAge = now.getTime() - checkedAt.getTime();
      const isStale = cacheAge > cacheMaxAge;

      const subEnd = cache.subscription_end ? new Date(cache.subscription_end) : null;
      const expiringThreshold = 24 * 60 * 60 * 1000; // 24 hours
      const isExpiringSoon = subEnd && (subEnd.getTime() - now.getTime() < expiringThreshold);

      if (!isStale && !isExpiringSoon) {
        setSubscribed(cache.subscribed);
        setSubscriptionEnd(cache.subscription_end);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, []);

  // Single-flight Stripe subscription check
  const checkSubscriptionFromStripe = useCallback(async (sessionToCheck: Session): Promise<{ subscribed: boolean; subscriptionEnd: string | null }> => {
    // Check in-memory cache first
    if (subscriptionResultCache && Date.now() - subscriptionResultCache.ts < SUBSCRIPTION_CACHE_TTL) {
      console.log("[App] Using cached subscription result");
      return subscriptionResultCache.value;
    }
    
    // If there's already an in-flight request, await it
    if (inFlightSubscriptionCheck) {
      console.log("[App] Awaiting in-flight subscription check");
      return inFlightSubscriptionCheck;
    }
    
    // Create new in-flight request
    console.log("[App] Starting new subscription check");
    inFlightSubscriptionCheck = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('check-subscription', {
          headers: {
            Authorization: `Bearer ${sessionToCheck.access_token}`,
          },
        });

        if (error) throw error;

        const result = {
          subscribed: data.subscribed || false,
          subscriptionEnd: data.subscription_end || null,
        };
        
        // Cache the result
        subscriptionResultCache = { value: result, ts: Date.now() };
        
        return result;
      } catch (error) {
        console.error('[App] Error checking subscription:', error);
        return { subscribed: false, subscriptionEnd: null };
      } finally {
        inFlightSubscriptionCheck = null;
      }
    })();
    
    return inFlightSubscriptionCheck;
  }, []);

  const checkSubscription = useCallback(async () => {
    if (!session || !organization) {
      setSubscribed(false);
      setSubscriptionEnd(null);
      return;
    }

    setCheckingSubscription(true);
    
    try {
      // Try cache first
      const usedCache = await readSubscriptionFromCache(organization.id);
      if (usedCache) {
        return;
      }

      // Fallback to Stripe check (single-flight)
      const result = await checkSubscriptionFromStripe(session);
      setSubscribed(result.subscribed);
      setSubscriptionEnd(result.subscriptionEnd);
    } finally {
      setCheckingSubscription(false);
    }
  }, [session, organization, readSubscriptionFromCache, checkSubscriptionFromStripe]);

  // ==================== REALTIME SUBSCRIPTION ====================
  
  useEffect(() => {
    if (!organization?.id) return;

    // Clean up existing channel
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channelName = `app-subscription-cache-${organization.id}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'organization_subscription_cache',
          filter: `organization_id=eq.${organization.id}`,
        },
        (payload) => {
          const newData = payload.new as SubscriptionCache | undefined;
          if (newData) {
            setSubscribed(newData.subscribed ?? false);
            setSubscriptionEnd(newData.subscription_end ?? null);
            // Invalidate in-memory cache on realtime update
            subscriptionResultCache = null;
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [organization?.id]);

  // ==================== AUTH STATE LISTENER ====================
  
  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);

        if (newSession?.user) {
          // Defer organization load to prevent deadlock
          setTimeout(async () => {
            const orgId = await loadOrganization(newSession.user.id);
            if (orgId) {
              // Re-fetch org to get latest data for skip check
              const { data: freshOrg } = await supabase
                .from('organizations')
                .select('id, billing_status, stripe_customer_id')
                .eq('id', orgId)
                .maybeSingle();
              
              // Skip Stripe check if we know there's no subscription
              if (shouldSkipStripeCheck(freshOrg as Organization | null)) {
                setSubscribed(false);
                setSubscriptionEnd(null);
                return;
              }
              
              const usedCache = await readSubscriptionFromCache(orgId);
              if (!usedCache) {
                const result = await checkSubscriptionFromStripe(newSession);
                setSubscribed(result.subscribed);
                setSubscriptionEnd(result.subscriptionEnd);
              }
            }
          }, 0);
        } else {
          setOrganization(null);
          setRole(null);
          setOrganizationLoading(false);
          setSubscribed(false);
          setSubscriptionEnd(null);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setLoading(false);

      if (existingSession?.user) {
        setTimeout(async () => {
          const orgId = await loadOrganization(existingSession.user.id);
          if (orgId) {
            // Re-fetch org to get latest data for skip check
            const { data: freshOrg } = await supabase
              .from('organizations')
              .select('id, billing_status, stripe_customer_id')
              .eq('id', orgId)
              .maybeSingle();
            
            // Skip Stripe check if we know there's no subscription
            if (shouldSkipStripeCheck(freshOrg as Organization | null)) {
              setSubscribed(false);
              setSubscriptionEnd(null);
              return;
            }
            
            const usedCache = await readSubscriptionFromCache(orgId);
            if (!usedCache) {
              const result = await checkSubscriptionFromStripe(existingSession);
              setSubscribed(result.subscribed);
              setSubscriptionEnd(result.subscriptionEnd);
            }
          }
        }, 0);
      } else {
        setOrganizationLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadOrganization, readSubscriptionFromCache, checkSubscriptionFromStripe]);

  // ==================== VISIBILITY CHANGE HANDLER ====================
  
  useEffect(() => {
    if (!session || !organization) return;

    let lastCheck = Date.now();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLastCheck = Date.now() - lastCheck;
        // Only re-check if tab was hidden for more than 30 minutes
        if (timeSinceLastCheck > 30 * 60 * 1000) {
          checkSubscription();
        }
        lastCheck = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [session, organization, checkSubscription]);

  // ==================== ACTIONS ====================
  
  const signOut = useCallback(async () => {
    // Clear caches on sign out
    subscriptionResultCache = null;
    inFlightSubscriptionCheck = null;
    await supabase.auth.signOut();
    navigate("/auth");
  }, [navigate]);

  const refreshOrganization = useCallback(async () => {
    if (user) {
      await loadOrganization(user.id);
    }
  }, [user, loadOrganization]);

  // ==================== CONTEXT VALUE ====================

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo<AppContextType>(() => ({
    user,
    session,
    loading,
    organization,
    role,
    organizationLoading,
    organizationError,
    subscribed,
    subscriptionEnd,
    checkingSubscription,
    signOut,
    refreshOrganization,
    checkSubscription,
  }), [
    user,
    session,
    loading,
    organization,
    role,
    organizationLoading,
    organizationError,
    subscribed,
    subscriptionEnd,
    checkingSubscription,
    signOut,
    refreshOrganization,
    checkSubscription,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};