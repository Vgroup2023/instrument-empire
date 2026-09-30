import { getDb } from '@/db/client';
import { accounts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAccountBalances } from '@/lib/accounting/chartOfAccounts';
import { currentAndPriorMonth, type DateRange } from '@/lib/dateRanges';

// Period-over-period ("flux") variance analysis — the month-end-close
// question of "what moved, and by how much, since last period." This is
// quantitative only: it computes and sorts variances from this app's own
// ledger, it does not write narrative commentary (that would need an LLM
// call, which needs an Anthropic API key this app doesn't have configured).
// Not a connection to Numeric or any other third-party close-automation
// tool — a credential-free, in-house equivalent of the same idea.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface FluxRow {
  accountId: string;
  accountName: string;
  accountType: string;
  currentAmount: number;
  priorAmount: number;
  variance: number;
  /** Null when the prior amount was zero — a percentage change from zero isn't meaningful. */
  variancePercent: number | null;
}

export interface FluxAnalysis {
  current: DateRange;
  prior: DateRange;
  rows: FluxRow[];
}

/**
 * Compares each account's net activity this month (to date) against the
 * full prior calendar month, sorted by the largest absolute dollar swing
 * first. Accounts with no activity in either period are omitted — nothing
 * to flag there.
 */
export async function getFluxAnalysis(): Promise<FluxAnalysis> {
  const { current, prior } = currentAndPriorMonth();
  const db = getDb();

  const [accountRows, currentBalances, priorBalances] = await Promise.all([
    db
      .select({ id: accounts.id, name: accounts.name, accountType: accounts.accountType })
      .from(accounts)
      .where(eq(accounts.active, true)),
    getAccountBalances(current),
    getAccountBalances(prior),
  ]);

  const rows: FluxRow[] = [];
  for (const account of accountRows) {
    const currentAmount = round2(currentBalances.get(account.id) ?? 0);
    const priorAmount = round2(priorBalances.get(account.id) ?? 0);
    if (currentAmount === 0 && priorAmount === 0) continue;
    const variance = round2(currentAmount - priorAmount);
    const variancePercent = priorAmount !== 0 ? round2((variance / Math.abs(priorAmount)) * 100) : null;
    rows.push({
      accountId: account.id,
      accountName: account.name,
      accountType: account.accountType,
      currentAmount,
      priorAmount,
      variance,
      variancePercent,
    });
  }

  rows.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  return { current, prior, rows };
}
