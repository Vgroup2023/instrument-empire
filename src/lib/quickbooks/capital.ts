import { providers } from '@/lib/config';
import { mockGetLoans, mockGetPeerBenchmarks } from '@/lib/quickbooks/mock/capital';

export interface Loan {
  id: string;
  product: string;
  originalAmount: number;
  outstandingBalance: number;
  apr: number;
  termMonths: number;
  monthlyPayment: number;
  status: 'active' | 'paid_off';
  originationDate: string;
  nextPaymentDate: string | null;
}

export interface PeerLendingBenchmark {
  metric: string;
  unit: 'percent' | 'currency';
  yourValue: number;
  peerMedian: number;
}

function assertMock(action: string) {
  if (providers.capital === 'live') {
    throw new Error(
      `CAPITAL_PROVIDER=live is set, but ${action} isn't wired up yet. QuickBooks Capital's lending data is a ` +
        'separate Intuit product from the standard Accounting API — implement the call in ' +
        'src/lib/quickbooks/capital.ts once that access is provisioned.',
    );
  }
}

/**
 * QuickBooks Capital loan and peer-lending data requires separate Intuit
 * lending product access, so this returns empty by default
 * (CAPITAL_PROVIDER=mock) rather than fabricated loans — read-only,
 * matching the "check my loans and peer benchmarks" use case (no loan
 * origination actions are exposed here). Wire up real calls here once
 * that access is provisioned and flip CAPITAL_PROVIDER=live.
 */
export async function getLoans(): Promise<Loan[]> {
  assertMock('reading QuickBooks Capital loans');
  return mockGetLoans();
}

export async function getPeerLendingBenchmarks(): Promise<PeerLendingBenchmark[]> {
  assertMock('reading peer lending benchmarks');
  return mockGetPeerBenchmarks();
}
