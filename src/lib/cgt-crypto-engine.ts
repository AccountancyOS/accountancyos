/**
 * CGT + Crypto Engine
 * Implements HMRC crypto tax rules:
 * - Section 104 pooling (weighted average cost)
 * - Same-day rule (match disposals to same-day acquisitions first)
 * - 30-day (bed & breakfast) rule
 * - Airdrop/fork classification
 * - Fee allocation
 * - Annual exempt amount and loss carry-forward
 */

import type { CGTDisposalEntry, CGTSchedule } from '@/types/filing-schemas';

// ==================== TYPES ====================

export interface CryptoTransaction {
  id?: string;
  tx_date: string; // ISO date
  tx_type: 'buy' | 'sell' | 'swap_in' | 'swap_out' | 'transfer_in' | 'transfer_out' | 'airdrop' | 'fork' | 'mining' | 'staking_reward' | 'gift_received' | 'gift_given' | 'lost' | 'fee';
  token_symbol: string;
  quantity: number;
  cost_gbp: number;
  proceeds_gbp: number;
  fee_gbp: number;
  classification?: 'income' | 'capital' | 'non_taxable' | 'unclassified';
  counterpart_token?: string;
  exchange_name?: string;
  notes?: string;
}

export interface TokenPool {
  token_symbol: string;
  total_quantity: number;
  total_cost_gbp: number;
  average_cost_per_unit: number;
}

export interface CryptoDisposalResult {
  tx_date: string;
  token_symbol: string;
  quantity: number;
  proceeds_gbp: number;
  allowable_cost: number;
  gain_or_loss: number;
  matching_rule: 'same_day' | 'bed_and_breakfast' | 'section_104';
  fee_allocated: number;
}

export interface CryptoComputationResult {
  disposals: CryptoDisposalResult[];
  final_pools: TokenPool[];
  total_gains: number;
  total_losses: number;
  net_gains: number;
  income_items: Array<{
    tx_date: string;
    token_symbol: string;
    amount_gbp: number;
    type: string;
  }>;
}

// ==================== CLASSIFICATION ====================

/** Classify transaction types into income vs capital */
export function classifyCryptoTx(tx: CryptoTransaction): 'income' | 'capital' | 'non_taxable' {
  switch (tx.tx_type) {
    case 'mining':
    case 'staking_reward':
      return 'income'; // Miscellaneous income for most individuals
    case 'airdrop':
      // Airdrops received in return for a service = income; unsolicited = capital
      return tx.classification === 'income' ? 'income' : 'capital';
    case 'fork':
      return 'capital'; // Hard forks — zero cost base acquisition
    case 'gift_given':
      return 'capital'; // Deemed disposal at market value
    case 'lost':
      return 'capital'; // Negligible value claim
    case 'transfer_in':
    case 'transfer_out':
      return 'non_taxable'; // Wallet-to-wallet, no disposal
    case 'buy':
    case 'swap_in':
    case 'gift_received':
      return 'non_taxable'; // Acquisitions only
    case 'sell':
    case 'swap_out':
      return 'capital'; // Disposals
    case 'fee':
      return 'non_taxable'; // Fees are costs, not standalone events
    default:
      return 'capital';
  }
}

// ==================== MATCHING RULES ====================

interface AcquisitionBucket {
  date: string;
  quantity: number;
  cost_gbp: number;
}

/**
 * Compute crypto disposals using HMRC matching rules:
 * 1. Same-day rule
 * 2. Bed & breakfast (30-day) rule
 * 3. Section 104 pool
 */
export function computeCryptoDisposals(
  transactions: CryptoTransaction[],
  existingPools?: TokenPool[]
): CryptoComputationResult {
  // Sort all transactions by date
  const sorted = [...transactions].sort((a, b) => a.tx_date.localeCompare(b.tx_date));

  // Group by token
  const tokenGroups = new Map<string, CryptoTransaction[]>();
  for (const tx of sorted) {
    const group = tokenGroups.get(tx.token_symbol) || [];
    group.push(tx);
    tokenGroups.set(tx.token_symbol, group);
  }

  const allDisposals: CryptoDisposalResult[] = [];
  const finalPools: TokenPool[] = [];
  const incomeItems: CryptoComputationResult['income_items'] = [];

  for (const [symbol, txs] of tokenGroups) {
    // Initialize Section 104 pool
    const pool: TokenPool = existingPools?.find(p => p.token_symbol === symbol) 
      ? { ...existingPools.find(p => p.token_symbol === symbol)! }
      : { token_symbol: symbol, total_quantity: 0, total_cost_gbp: 0, average_cost_per_unit: 0 };

    // Separate acquisitions and disposals
    const acquisitions: AcquisitionBucket[] = [];
    const disposals: Array<{ tx: CryptoTransaction; remaining: number }> = [];

    for (const tx of txs) {
      const txClass = classifyCryptoTx(tx);

      // Handle income items
      if (txClass === 'income') {
        incomeItems.push({
          tx_date: tx.tx_date,
          token_symbol: tx.token_symbol,
          amount_gbp: tx.cost_gbp || tx.proceeds_gbp,
          type: tx.tx_type,
        });
        // Income tokens still enter the pool at their market value
        acquisitions.push({ date: tx.tx_date, quantity: tx.quantity, cost_gbp: tx.cost_gbp });
        continue;
      }

      if (txClass === 'non_taxable' && tx.tx_type !== 'fee') {
        // Acquisitions enter pool
        if (['buy', 'swap_in', 'gift_received', 'transfer_in'].includes(tx.tx_type)) {
          const cost = tx.tx_type === 'gift_received' ? tx.cost_gbp : tx.cost_gbp + tx.fee_gbp;
          acquisitions.push({ date: tx.tx_date, quantity: tx.quantity, cost_gbp: cost });
        }
        continue;
      }

      // Disposals
      if (['sell', 'swap_out', 'gift_given', 'lost'].includes(tx.tx_type)) {
        disposals.push({ tx, remaining: tx.quantity });
      }
    }

    // Process disposals with matching rules
    for (const disposal of disposals) {
      const { tx } = disposal;
      let remaining = disposal.remaining;
      const proceeds = tx.proceeds_gbp;
      const fee = tx.fee_gbp;

      // Rule 1: Same-day matching
      const sameDayAcqs = acquisitions.filter(a => a.date === tx.tx_date && a.quantity > 0);
      let sameDayMatched = 0;
      let sameDayCost = 0;
      for (const acq of sameDayAcqs) {
        if (remaining <= 0) break;
        const match = Math.min(remaining, acq.quantity);
        const costPortion = (match / acq.quantity) * acq.cost_gbp;
        sameDayMatched += match;
        sameDayCost += costPortion;
        acq.quantity -= match;
        acq.cost_gbp -= costPortion;
        remaining -= match;
      }

      if (sameDayMatched > 0) {
        const feePortion = (sameDayMatched / tx.quantity) * fee;
        const proceedsPortion = (sameDayMatched / tx.quantity) * proceeds;
        allDisposals.push({
          tx_date: tx.tx_date,
          token_symbol: symbol,
          quantity: sameDayMatched,
          proceeds_gbp: proceedsPortion,
          allowable_cost: sameDayCost + feePortion,
          gain_or_loss: proceedsPortion - sameDayCost - feePortion,
          matching_rule: 'same_day',
          fee_allocated: feePortion,
        });
      }

      // Rule 2: Bed & breakfast (30-day) rule
      if (remaining > 0) {
        const disposalDate = new Date(tx.tx_date);
        const thirtyDaysLater = new Date(disposalDate);
        thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

        const bnbAcqs = acquisitions.filter(a => {
          const acqDate = new Date(a.date);
          return acqDate > disposalDate && acqDate <= thirtyDaysLater && a.quantity > 0;
        }).sort((a, b) => a.date.localeCompare(b.date));

        let bnbMatched = 0;
        let bnbCost = 0;
        for (const acq of bnbAcqs) {
          if (remaining <= 0) break;
          const match = Math.min(remaining, acq.quantity);
          const costPortion = (match / acq.quantity) * acq.cost_gbp;
          bnbMatched += match;
          bnbCost += costPortion;
          acq.quantity -= match;
          acq.cost_gbp -= costPortion;
          remaining -= match;
        }

        if (bnbMatched > 0) {
          const feePortion = (bnbMatched / tx.quantity) * fee;
          const proceedsPortion = (bnbMatched / tx.quantity) * proceeds;
          allDisposals.push({
            tx_date: tx.tx_date,
            token_symbol: symbol,
            quantity: bnbMatched,
            proceeds_gbp: proceedsPortion,
            allowable_cost: bnbCost + feePortion,
            gain_or_loss: proceedsPortion - bnbCost - feePortion,
            matching_rule: 'bed_and_breakfast',
            fee_allocated: feePortion,
          });
        }
      }

      // Rule 3: Section 104 pool
      if (remaining > 0) {
        // First, add unmatched acquisitions up to this date into pool
        for (const acq of acquisitions) {
          if (acq.date <= tx.tx_date && acq.quantity > 0) {
            pool.total_quantity += acq.quantity;
            pool.total_cost_gbp += acq.cost_gbp;
            acq.quantity = 0;
            acq.cost_gbp = 0;
          }
        }
        pool.average_cost_per_unit = pool.total_quantity > 0
          ? pool.total_cost_gbp / pool.total_quantity : 0;

        const poolMatch = Math.min(remaining, pool.total_quantity);
        if (poolMatch > 0) {
          const poolCost = poolMatch * pool.average_cost_per_unit;
          const feePortion = (poolMatch / tx.quantity) * fee;
          const proceedsPortion = (poolMatch / tx.quantity) * proceeds;

          allDisposals.push({
            tx_date: tx.tx_date,
            token_symbol: symbol,
            quantity: poolMatch,
            proceeds_gbp: proceedsPortion,
            allowable_cost: poolCost + feePortion,
            gain_or_loss: proceedsPortion - poolCost - feePortion,
            matching_rule: 'section_104',
            fee_allocated: feePortion,
          });

          pool.total_quantity -= poolMatch;
          pool.total_cost_gbp -= poolCost;
          remaining -= poolMatch;
        }
      }
    }

    // Add remaining acquisitions to pool
    for (const acq of acquisitions) {
      if (acq.quantity > 0) {
        pool.total_quantity += acq.quantity;
        pool.total_cost_gbp += acq.cost_gbp;
      }
    }
    pool.average_cost_per_unit = pool.total_quantity > 0
      ? pool.total_cost_gbp / pool.total_quantity : 0;

    if (pool.total_quantity > 0 || allDisposals.some(d => d.token_symbol === symbol)) {
      finalPools.push(pool);
    }
  }

  const total_gains = allDisposals.filter(d => d.gain_or_loss > 0).reduce((s, d) => s + d.gain_or_loss, 0);
  const total_losses = Math.abs(allDisposals.filter(d => d.gain_or_loss < 0).reduce((s, d) => s + d.gain_or_loss, 0));

  return {
    disposals: allDisposals,
    final_pools: finalPools,
    total_gains,
    total_losses,
    net_gains: total_gains - total_losses,
    income_items: incomeItems,
  };
}

// ==================== CGT SCHEDULE BUILDER ====================

/**
 * Build CGTSchedule from computed crypto disposals + manual non-crypto disposals.
 */
export function buildCGTSchedule(
  cryptoResult: CryptoComputationResult,
  manualDisposals: CGTDisposalEntry[],
  annualExemptAmount: number,
  lossesBroughtForwardUsed: number = 0
): CGTSchedule {
  // Convert crypto disposals to CGTDisposalEntry format
  const cryptoEntries: CGTDisposalEntry[] = cryptoResult.disposals.map(d => ({
    asset_description: `${d.token_symbol} (${d.matching_rule})`,
    asset_type: 'crypto' as const,
    acquisition_date: '', // N/A for pooled
    disposal_date: d.tx_date,
    disposal_proceeds: round2(d.proceeds_gbp),
    allowable_costs: round2(d.allowable_cost),
    gain_or_loss: round2(d.gain_or_loss),
    is_residential_property: false,
    token_symbol: d.token_symbol,
  }));

  const allDisposals = [...manualDisposals, ...cryptoEntries];

  const total_gains = allDisposals.filter(d => d.gain_or_loss > 0).reduce((s, d) => s + d.gain_or_loss, 0);
  const total_losses = Math.abs(allDisposals.filter(d => d.gain_or_loss < 0).reduce((s, d) => s + d.gain_or_loss, 0));
  const net_gains = total_gains - total_losses;
  const taxable_gains = Math.max(0, net_gains - annualExemptAmount - lossesBroughtForwardUsed);
  const losses_carried_forward = total_losses > total_gains ? total_losses - total_gains : 0;

  const crypto_disposals = allDisposals.filter(d => d.asset_type === 'crypto');

  return {
    disposals: allDisposals,
    total_gains: round2(total_gains),
    total_losses: round2(total_losses),
    net_gains: round2(net_gains),
    annual_exempt_amount: annualExemptAmount,
    taxable_gains: round2(taxable_gains),
    losses_brought_forward_used: lossesBroughtForwardUsed,
    losses_carried_forward: round2(losses_carried_forward),
    crypto_disposals_count: crypto_disposals.length,
    crypto_total_gains: round2(crypto_disposals.filter(d => d.gain_or_loss > 0).reduce((s, d) => s + d.gain_or_loss, 0)),
  };
}

// ==================== CSV IMPORT PARSER ====================

export interface CryptoCSVRow {
  date: string;
  type: string;
  token: string;
  quantity: string;
  cost_gbp: string;
  proceeds_gbp: string;
  fee_gbp: string;
  exchange?: string;
  notes?: string;
}

const TX_TYPE_MAP: Record<string, CryptoTransaction['tx_type']> = {
  buy: 'buy', purchase: 'buy',
  sell: 'sell', sale: 'sell',
  swap_in: 'swap_in', 'swap in': 'swap_in',
  swap_out: 'swap_out', 'swap out': 'swap_out',
  transfer_in: 'transfer_in', 'transfer in': 'transfer_in', deposit: 'transfer_in',
  transfer_out: 'transfer_out', 'transfer out': 'transfer_out', withdrawal: 'transfer_out',
  airdrop: 'airdrop',
  fork: 'fork', 'hard fork': 'fork',
  mining: 'mining',
  staking: 'staking_reward', staking_reward: 'staking_reward',
  gift_received: 'gift_received', 'gift received': 'gift_received',
  gift_given: 'gift_given', 'gift given': 'gift_given',
  lost: 'lost',
  fee: 'fee',
};

export function parseCryptoCSVRow(row: CryptoCSVRow): CryptoTransaction | null {
  const txType = TX_TYPE_MAP[row.type?.toLowerCase().trim()];
  if (!txType) return null;

  return {
    tx_date: row.date,
    tx_type: txType,
    token_symbol: row.token?.toUpperCase().trim() || 'UNKNOWN',
    quantity: parseFloat(row.quantity) || 0,
    cost_gbp: parseFloat(row.cost_gbp) || 0,
    proceeds_gbp: parseFloat(row.proceeds_gbp) || 0,
    fee_gbp: parseFloat(row.fee_gbp) || 0,
    exchange_name: row.exchange,
    notes: row.notes,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
