import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { User, Session, RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  subscribed: boolean;
  subscriptionEnd: string | null;
  checkingSubscription: boolean;
  checkSubscription: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  subscribed: false,
  subscriptionEnd: null,
  checkingSubscription: false,
  checkSubscription: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const navigate = useNavigate();

  // Fetch organization ID for current user
  const fetchOrganizationId = async (userId: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from('organization_users')
      .select('organization_id')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      console.debug('[Auth] No organization found for user');
      return null;
    }
    return data.organization_id;
  };

  // Try to read subscription from cache first
  const readFromCache = async (orgId: string): Promise<boolean> => {
    try {
      const { data: cache, error } = await supabase
        .from('organization_subscription_cache')
        .select('subscribed, subscription_end, subscription_status, checked_at')
        .eq('organization_id', orgId)
        .single();

      if (error || !cache) {
        console.debug('[Auth] No cache entry found');
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
        console.debug('[Auth] Using cached subscription status', { subscribed: cache.subscribed });
        setSubscribed(cache.subscribed);
        setSubscriptionEnd(cache.subscription_end);
        return true;
      }

      console.debug('[Auth] Cache is stale or subscription expiring soon');
      return false;
    } catch (error) {
      console.debug('[Auth] Error reading cache', error);
      return false;
    }
  };

  // Full subscription check via edge function (fallback)
  const checkSubscriptionFromStripe = async (sessionToCheck: Session): Promise<void> => {
    setCheckingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${sessionToCheck.access_token}`,
        },
      });

      if (error) throw error;

      setSubscribed(data.subscribed || false);
      setSubscriptionEnd(data.subscription_end || null);
      console.debug('[Auth] Subscription checked from Stripe', { subscribed: data.subscribed, fromCache: data.from_cache });
    } catch (error) {
      console.error('[Auth] Error checking subscription:', error);
      setSubscribed(false);
      setSubscriptionEnd(null);
    } finally {
      setCheckingSubscription(false);
    }
  };

  // Main check subscription function
  const checkSubscription = async (sessionToCheck?: Session | null) => {
    const activeSession = sessionToCheck ?? session;
    
    if (!activeSession) {
      setSubscribed(false);
      setSubscriptionEnd(null);
      return;
    }

    // Get organization ID if we don't have it
    let orgId = organizationId;
    if (!orgId && activeSession.user) {
      orgId = await fetchOrganizationId(activeSession.user.id);
      setOrganizationId(orgId);
    }

    // Try cache first
    if (orgId) {
      const usedCache = await readFromCache(orgId);
      if (usedCache) {
        return; // Cache was fresh enough
      }
    }

    // Fallback to Stripe check
    await checkSubscriptionFromStripe(activeSession);
  };

  // Set up realtime subscription for cache updates
  useEffect(() => {
    if (!organizationId) return;

    // Clean up existing channel
    if (realtimeChannelRef.current) {
      console.debug('[Auth] Cleaning up existing subscription cache channel');
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channelName = `subscription-cache-${organizationId}`;
    console.debug('[Auth] Setting up realtime subscription for cache', { organizationId });

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'organization_subscription_cache',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          console.debug('[Auth] Subscription cache updated via realtime', payload.new);
          const newData = payload.new as any;
          if (newData) {
            setSubscribed(newData.subscribed ?? false);
            setSubscriptionEnd(newData.subscription_end ?? null);
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        console.debug(`[Auth] Unsubscribing from ${channelName}`);
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [organizationId]);

  useEffect(() => {
    // Set up auth state listener FIRST - must be synchronous to avoid deadlock
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        // Only synchronous state updates here
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        
        // Defer Supabase calls with setTimeout to prevent deadlock
        if (newSession) {
          setTimeout(() => {
            checkSubscription(newSession);
          }, 0);
        } else {
          setSubscribed(false);
          setSubscriptionEnd(null);
          setOrganizationId(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setLoading(false);
      
      // Defer subscription check - pass session directly
      if (existingSession) {
        setTimeout(() => {
          checkSubscription(existingSession);
        }, 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // NO MORE POLLING - realtime handles updates now
  // Only re-check on window focus after long absence (optional safety net)
  useEffect(() => {
    if (!session) return;

    let lastCheck = Date.now();
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLastCheck = Date.now() - lastCheck;
        // Only re-check if tab was hidden for more than 30 minutes
        if (timeSinceLastCheck > 30 * 60 * 1000) {
          console.debug('[Auth] Tab visible after long absence, checking subscription');
          checkSubscription(session);
        }
        lastCheck = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [session]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      loading, 
      subscribed, 
      subscriptionEnd, 
      checkingSubscription,
      checkSubscription: () => checkSubscription(session),
      signOut 
    }}>
      {children}
    </AuthContext.Provider>
  );
};
