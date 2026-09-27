import type { Loan, PeerLendingBenchmark } from '@/lib/quickbooks/capital';

export async function mockGetLoans(): Promise<Loan[]> {
  return [
    {
      id: 'loan_1',
      product: 'QuickBooks Capital term loan',
      originalAmount: 50000,
      outstandingBalance: 31250,
      apr: 10.5,
      termMonths: 24,
      monthlyPayment: 2312.45,
      status: 'active',
      originationDate: '2025-04-01',
      nextPaymentDate: '2026-10-01',
    },
    {
      id: 'loan_2',
      product: 'QuickBooks Capital line of credit',
      originalAmount: 15000,
      outstandingBalance: 0,
      apr: 12.0,
      termMonths: 12,
      monthlyPayment: 0,
      status: 'paid_off',
      originationDate: '2024-02-15',
      nextPaymentDate: null,
    },
  ];
}

export async function mockGetPeerBenchmarks(): Promise<PeerLendingBenchmark[]> {
  return [
    { metric: 'Average APR', unit: 'percent', yourValue: 10.5, peerMedian: 13.2 },
    { metric: 'Loan-to-revenue ratio', unit: 'percent', yourValue: 5.6, peerMedian: 8.1 },
    { metric: 'On-time payment rate', unit: 'percent', yourValue: 100, peerMedian: 94.5 },
  ];
}
