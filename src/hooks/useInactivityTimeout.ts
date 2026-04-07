import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const;
const THROTTLE_MS = 30_000; // Only update "last active" every 30s

/**
 * Hook that enforces a 10-minute inactivity timeout.
 * Signs the user out automatically when inactive.
 */
export function useInactivityTimeout(
  isAuthenticated: boolean,
  onTimeout: () => void
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());

  const resetTimer = useCallback(() => {
    const now = Date.now();
    // Throttle: ignore if last reset was < THROTTLE_MS ago
    if (now - lastActivityRef.current < THROTTLE_MS) return;
    lastActivityRef.current = now;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      console.info('[Session] Inactivity timeout reached, signing out');
      onTimeout();
    }, INACTIVITY_TIMEOUT_MS);
  }, [onTimeout]);

  useEffect(() => {
    if (!isAuthenticated) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Start the timer immediately
    lastActivityRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      console.info('[Session] Inactivity timeout reached, signing out');
      onTimeout();
    }, INACTIVITY_TIMEOUT_MS);

    // Listen for user activity
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    // Also reset on visibility change (tab becomes visible)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Check if we should have timed out while hidden
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= INACTIVITY_TIMEOUT_MS) {
          console.info('[Session] Timed out while tab was hidden');
          onTimeout();
        } else {
          resetTimer();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, resetTimer, onTimeout]);
}
