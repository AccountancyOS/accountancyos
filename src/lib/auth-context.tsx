import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
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
  const navigate = useNavigate();

  // CRITICAL FIX: Accept session as parameter to avoid stale closure issues
  const checkSubscription = async (sessionToCheck?: Session | null) => {
    const activeSession = sessionToCheck ?? session;
    
    if (!activeSession) {
      setSubscribed(false);
      setSubscriptionEnd(null);
      return;
    }

    setCheckingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`,
        },
      });

      if (error) throw error;

      setSubscribed(data.subscribed || false);
      setSubscriptionEnd(data.subscription_end || null);
    } catch (error) {
      console.error('Error checking subscription:', error);
      setSubscribed(false);
      setSubscriptionEnd(null);
    } finally {
      setCheckingSubscription(false);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST - must be synchronous to avoid deadlock
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        // Only synchronous state updates here
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);
        
        // Defer Supabase calls with setTimeout to prevent deadlock
        // CRITICAL FIX: Pass the session directly to avoid stale closure
        if (newSession) {
          setTimeout(() => {
            checkSubscription(newSession);
          }, 0);
        } else {
          setSubscribed(false);
          setSubscriptionEnd(null);
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

  useEffect(() => {
    if (!session) return;

    const interval = setInterval(() => {
      checkSubscription(session);
    }, 60000);

    return () => clearInterval(interval);
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