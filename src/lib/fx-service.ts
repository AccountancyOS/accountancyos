import { supabase } from "@/integrations/supabase/client";

export const SUPPORTED_CURRENCIES = ['GBP', 'EUR', 'USD', 'AUD', 'CAD', 'ZAR', 'CHF', 'JPY', 'NZD', 'INR', 'SGD'];

export interface FXRate {
  rate: number;
  source: 'cache' | 'api' | 'identity' | 'manual';
}

/**
 * Get the exchange rate for a currency pair on a specific date
 */
export async function getFXRate(
  baseCurrency: string,
  targetCurrency: string,
  date: string
): Promise<FXRate> {
  // Same currency = 1.0
  if (baseCurrency === targetCurrency) {
    return { rate: 1.0, source: 'identity' };
  }

  try {
    // First try local cache
    const { data: cachedRate } = await supabase
      .from('fx_rates')
      .select('rate')
      .eq('base_currency', baseCurrency)
      .eq('target_currency', targetCurrency)
      .eq('rate_date', date)
      .single();

    if (cachedRate) {
      return { rate: Number(cachedRate.rate), source: 'cache' };
    }

    // Try edge function for fresh rate
    const { data, error } = await supabase.functions.invoke('fx-rates', {
      body: {
        action: 'get_rate',
        base_currency: baseCurrency,
        target_currency: targetCurrency,
        date,
      },
    });

    if (error) throw error;
    
    return {
      rate: Number(data.rate),
      source: data.source || 'api',
    };
  } catch (error) {
    console.error('Failed to fetch FX rate:', error);
    // Fallback to 1.0 with warning
    return { rate: 1.0, source: 'manual' };
  }
}

/**
 * Convert an amount from one currency to another
 */
export function convertCurrency(
  amount: number,
  fxRate: number
): number {
  return amount * fxRate;
}

/**
 * Calculate base currency amount from transaction amount and FX rate
 * For GBP base: if transaction is in EUR, base = EUR amount / EUR rate
 * Since rates are typically quoted as GBP/EUR (how many EUR per 1 GBP)
 */
export function calculateBaseCurrencyAmount(
  transactionAmount: number,
  fxRateToBase: number
): number {
  if (fxRateToBase === 0) return transactionAmount;
  return transactionAmount / fxRateToBase;
}

/**
 * Format currency for display
 */
export function formatCurrencyAmount(
  amount: number,
  currency: string = 'GBP'
): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount);
}
