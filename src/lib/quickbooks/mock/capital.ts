import type { Loan, PeerLendingBenchmark } from '@/lib/quickbooks/capital';

// No QuickBooks Capital product access is wired up (see CAPITAL_PROVIDER
// in src/lib/quickbooks/capital.ts), so there is no real loan data to
// show. Returning fabricated loans/APRs here would risk being mistaken
// for real obligations in a tool used for actual bookkeeping — so this
// stays empty until that access is provisioned and wired in.
export async function mockGetLoans(): Promise<Loan[]> {
  return [];
}

export async function mockGetPeerBenchmarks(): Promise<PeerLendingBenchmark[]> {
  return [];
}
