import { providers } from '@/lib/config';
import {
  mockCancelPaymentLink,
  mockCreatePaymentLink,
  mockListPaymentLinks,
  mockSendPaymentLink,
  mockUpdatePaymentLink,
} from '@/lib/quickbooks/mock/payments';

export interface PaymentLink {
  id: string;
  customerId: string;
  customerName: string;
  email?: string;
  amount: number;
  description?: string;
  status: 'active' | 'sent' | 'paid' | 'expired' | 'cancelled';
  url: string;
  createdAt: string;
  sentAt?: string;
}

export interface CreatePaymentLinkInput {
  customerId: string;
  customerName: string;
  email?: string;
  amount: number;
  description?: string;
}

function assertMock(action: string) {
  if (providers.payments === 'live') {
    throw new Error(
      `PAYMENTS_PROVIDER=live is set, but ${action} isn't wired up yet. QuickBooks Payments (payment links) is a ` +
        'separate Intuit product from the standard Accounting API — implement the call in ' +
        'src/lib/quickbooks/payments.ts once that access is provisioned.',
    );
  }
}

/**
 * Standalone payment links are a QuickBooks Payments feature, not part of
 * the public Accounting API, so this runs against demo data by default
 * (PAYMENTS_PROVIDER=mock). The UI, preview, and confirm-before-send flow
 * are fully real — only the underlying "create/send" calls are simulated
 * until QuickBooks Payments access is wired in here.
 */
export async function listPaymentLinks(): Promise<PaymentLink[]> {
  assertMock('listing payment links');
  return mockListPaymentLinks();
}

export async function createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLink> {
  assertMock('creating a payment link');
  return mockCreatePaymentLink(input);
}

export async function sendPaymentLink(id: string, email?: string): Promise<PaymentLink> {
  assertMock('sending a payment link');
  return mockSendPaymentLink(id, email);
}

export interface UpdatePaymentLinkInput {
  amount?: number;
  description?: string;
  email?: string;
}

/** Only a still-active (not yet sent/paid/cancelled) link can be edited. */
export async function updatePaymentLink(id: string, input: UpdatePaymentLinkInput): Promise<PaymentLink> {
  assertMock('updating a payment link');
  return mockUpdatePaymentLink(id, input);
}

export async function cancelPaymentLink(id: string): Promise<PaymentLink> {
  assertMock('cancelling a payment link');
  return mockCancelPaymentLink(id);
}
