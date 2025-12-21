/**
 * Rate limiting utilities for edge functions
 * Prevents abuse of external API calls
 */

import { SupabaseClient } from '@supabase/supabase-js-257';
import { logInfo, logWarn } from './logging.ts';
import { fail, ErrorCodes } from './responses.ts';

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  max: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/**
 * Pre-configured rate limits for different scopes
 */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  hmrc_submit: { max: 5, windowSeconds: 300 },      // 5 per 5 minutes
  hmrc_poll: { max: 30, windowSeconds: 300 },       // 30 per 5 minutes
  ch_submit: { max: 5, windowSeconds: 300 },        // 5 per 5 minutes
  email_send: { max: 10, windowSeconds: 60 },       // 10 per minute
  stripe_webhook: { max: 60, windowSeconds: 60 },   // 60 per minute (webhooks burst)
  default: { max: 100, windowSeconds: 60 },         // Default: 100 per minute
};

export interface CheckRateLimitOptions {
  orgId: string;
  userId: string;
  scope: string;
  traceId: string;
  /** Override the default rate limit for this scope */
  config?: RateLimitConfig;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds?: number;
}

/**
 * Check and increment rate limit counter
 * Returns whether the request is allowed
 */
export async function checkRateLimit(
  adminClient: SupabaseClient,
  options: CheckRateLimitOptions
): Promise<RateLimitResult> {
  const { orgId, userId, scope, traceId } = options;
  const config = options.config || RATE_LIMITS[scope] || RATE_LIMITS.default;
  
  const now = new Date();
  const windowStart = new Date(
    Math.floor(now.getTime() / (config.windowSeconds * 1000)) * (config.windowSeconds * 1000)
  );
  const windowEnd = new Date(windowStart.getTime() + config.windowSeconds * 1000);
  
  // Try to get or create the rate limit record
  const { data: existing, error: fetchError } = await adminClient
    .from('api_rate_limits')
    .select('id, count')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('scope', scope)
    .eq('window_start', windowStart.toISOString())
    .maybeSingle();
  
  if (fetchError) {
    // Log but don't block on rate limit check failures
    logWarn(traceId, 'Rate limit check failed, allowing request', {
      error: fetchError.message,
      scope,
    });
    return {
      allowed: true,
      remaining: config.max,
      resetAt: windowEnd,
    };
  }
  
  if (existing) {
    const currentCount = existing.count || 0;
    
    if (currentCount >= config.max) {
      const retryAfterSeconds = Math.ceil((windowEnd.getTime() - now.getTime()) / 1000);
      
      logWarn(traceId, 'Rate limit exceeded', {
        scope,
        orgId,
        userId,
        count: currentCount,
        max: config.max,
        retryAfterSeconds,
      });
      
      return {
        allowed: false,
        remaining: 0,
        resetAt: windowEnd,
        retryAfterSeconds,
      };
    }
    
    // Increment counter
    const { error: updateError } = await adminClient
      .from('api_rate_limits')
      .update({ count: currentCount + 1 })
      .eq('id', existing.id);
    
    if (updateError) {
      logWarn(traceId, 'Failed to increment rate limit counter', {
        error: updateError.message,
      });
    }
    
    logInfo(traceId, 'Rate limit check passed', {
      scope,
      count: currentCount + 1,
      max: config.max,
    });
    
    return {
      allowed: true,
      remaining: config.max - currentCount - 1,
      resetAt: windowEnd,
    };
  }
  
  // Create new rate limit record
  const { error: insertError } = await adminClient
    .from('api_rate_limits')
    .insert({
      organization_id: orgId,
      user_id: userId,
      scope,
      window_start: windowStart.toISOString(),
      count: 1,
    });
  
  if (insertError) {
    // Could be race condition, try to update instead
    if (insertError.code === '23505') { // Unique violation
      // Another request created it, retry the check
      return checkRateLimit(adminClient, options);
    }
    
    logWarn(traceId, 'Failed to create rate limit record', {
      error: insertError.message,
    });
  }
  
  logInfo(traceId, 'Rate limit check passed (new window)', {
    scope,
    count: 1,
    max: config.max,
  });
  
  return {
    allowed: true,
    remaining: config.max - 1,
    resetAt: windowEnd,
  };
}

/**
 * Create a 429 response for rate limiting
 */
export function rateLimitResponse(
  req: Request,
  result: RateLimitResult,
  traceId: string
): Response {
  return fail(
    req,
    {
      code: ErrorCodes.RATE_LIMITED,
      message: `Rate limit exceeded. Please retry after ${result.retryAfterSeconds} seconds.`,
      details: {
        retryAfterSeconds: result.retryAfterSeconds,
        resetAt: result.resetAt.toISOString(),
      },
      retryable: true,
    },
    traceId,
    429
  );
}
