import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface UseRealtimeSubscriptionOptions {
  table: string;
  schema?: string;
  organizationId: string | undefined;
  queryKeys: string[][];
  filter?: {
    column: string;
    value: string;
  };
  enabled?: boolean;
}

/**
 * Hook for subscribing to Supabase realtime changes and invalidating React Query cache
 */
export function useRealtimeSubscription({
  table,
  schema = 'public',
  organizationId,
  queryKeys,
  filter,
  enabled = true,
}: UseRealtimeSubscriptionOptions): void {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // Don't subscribe if disabled or no organization
    if (!enabled || !organizationId) {
      return;
    }

    // Create stable channel name based on subscription parameters (not Date.now())
    const channelName = `realtime-${table}-${organizationId}-${filter?.value || 'all'}`;
    
    // Check if we already have a channel with this identity
    if (channelRef.current) {
      console.debug(`[Realtime] Channel already exists for ${channelName}, skipping duplicate`);
      return;
    }

    // Build filter string for organization scoping
    const filterString = filter 
      ? `${filter.column}=eq.${filter.value}`
      : `organization_id=eq.${organizationId}`;

    const handleChange = () => {
      // Invalidate all related query keys
      for (const queryKey of queryKeys) {
        queryClient.invalidateQueries({ queryKey });
      }
    };

    // Create channel - subscribe to all events
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as const,
        {
          event: '*' as const,
          schema,
          table,
          filter: filterString,
        },
        handleChange
      )
      .subscribe();

    channelRef.current = channel;

    // Cleanup on unmount or dependency change
    return () => {
      if (channelRef.current) {
        console.debug(`[Realtime] Unsubscribing from ${channelName}`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // Use stable dependencies - queryKeys array identity should be stable from queryKeys registry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, schema, organizationId, queryClient, enabled, filter?.column, filter?.value]);
}

/**
 * Hook for subscribing to multiple tables at once
 */
export function useMultiTableRealtimeSubscription(
  subscriptions: Omit<UseRealtimeSubscriptionOptions, 'enabled'>[],
  enabled: boolean = true
): void {
  const queryClient = useQueryClient();
  const channelsRef = useRef<RealtimeChannel[]>([]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Clean up any existing channels first
    for (const channel of channelsRef.current) {
      supabase.removeChannel(channel);
    }
    channelsRef.current = [];

    // Create channels for each subscription
    for (const sub of subscriptions) {
      if (!sub.organizationId) continue;

      const channelName = `realtime-multi-${sub.table}-${sub.organizationId}-${sub.filter?.value || 'all'}`;
      const filterString = sub.filter
        ? `${sub.filter.column}=eq.${sub.filter.value}`
        : `organization_id=eq.${sub.organizationId}`;

      const handleChange = () => {
        for (const queryKey of sub.queryKeys) {
          queryClient.invalidateQueries({ queryKey });
        }
      };

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes' as const,
          {
            event: '*' as const,
            schema: sub.schema || 'public',
            table: sub.table,
            filter: filterString,
          },
          handleChange
        )
        .subscribe();

      channelsRef.current.push(channel);
    }

    return () => {
      for (const channel of channelsRef.current) {
        console.debug(`[Realtime] Unsubscribing from multi-table channel`);
        supabase.removeChannel(channel);
      }
      channelsRef.current = [];
    };
    // Subscriptions should use stable objects from queryKeys registry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, queryClient]);
}
