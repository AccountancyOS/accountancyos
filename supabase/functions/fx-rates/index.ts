import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Common currency pairs with GBP as base
const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'AUD', 'CAD', 'ZAR', 'CHF', 'JPY', 'NZD', 'INR', 'SGD'];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");

    // Verify cron secret for scheduled invocations
    const providedSecret = req.headers.get("X-Cron-Secret");
    if (!cronSecret || providedSecret !== cronSecret) {
      console.error("[fx-rates] Unauthorized: invalid or missing cron secret");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, base_currency = 'GBP', target_currency, date } = await req.json();

    if (action === 'get_rate') {
      // Get a specific rate for a currency pair and date
      if (!target_currency || !date) {
        return new Response(
          JSON.stringify({ error: 'target_currency and date are required' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // First check cache
      const { data: cachedRate } = await supabase
        .from('fx_rates')
        .select('rate')
        .eq('base_currency', base_currency)
        .eq('target_currency', target_currency)
        .eq('rate_date', date)
        .single();

      if (cachedRate) {
        return new Response(
          JSON.stringify({ rate: cachedRate.rate, source: 'cache' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch from free API (exchangerate-api.com has a free tier)
      const apiUrl = `https://api.exchangerate-api.com/v4/latest/${base_currency}`;
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        // Fallback: return 1.0 for same currency, or error
        if (base_currency === target_currency) {
          return new Response(
            JSON.stringify({ rate: 1.0, source: 'identity' }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error('Failed to fetch exchange rate');
      }

      const data = await response.json();
      const rate = data.rates?.[target_currency];

      if (!rate) {
        return new Response(
          JSON.stringify({ error: `Currency ${target_currency} not found` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Cache the rate (for the current date, rates are typically daily)
      const today = new Date().toISOString().split('T')[0];
      if (date === today) {
        await supabase.from('fx_rates').upsert({
          base_currency,
          target_currency,
          rate_date: date,
          rate: rate,
          source: 'api'
        }, { onConflict: 'base_currency,target_currency,rate_date' });
      }

      return new Response(
        JSON.stringify({ rate, source: 'api' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === 'refresh_all') {
      // Refresh all common GBP pairs for today
      const today = new Date().toISOString().split('T')[0];
      const apiUrl = `https://api.exchangerate-api.com/v4/latest/GBP`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch exchange rates');
      }

      const data = await response.json();
      const rates = [];

      for (const currency of SUPPORTED_CURRENCIES) {
        if (data.rates[currency]) {
          rates.push({
            base_currency: 'GBP',
            target_currency: currency,
            rate_date: today,
            rate: data.rates[currency],
            source: 'api'
          });
        }
      }

      // Upsert all rates
      const { error } = await supabase.from('fx_rates').upsert(rates, {
        onConflict: 'base_currency,target_currency,rate_date'
      });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, updated: rates.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === 'get_supported_currencies') {
      return new Response(
        JSON.stringify({ currencies: ['GBP', ...SUPPORTED_CURRENCIES] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('FX Rates error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
