import { qboFetch } from '@/lib/quickbooks/client';

export interface BillPayment {
  Id: string;
  SyncToken: string;
  VendorRef: { value: string; name?: string };
  TotalAmt: number;
  TxnDate: string;
  PayType: 'Check' | 'CreditCard';
}

export interface PayBillInput {
  billId: string;
  vendorId: string;
  vendorName?: string;
  /** How much of the bill's remaining balance to pay — defaults to the full balance. */
  amount: number;
  /** The Bank account the payment comes out of. */
  bankAccountId: string;
  bankAccountName?: string;
}

/**
 * Creates a BillPayment linked to the given bill via LinkedTxn — this is how
 * the public Accounting API models "pay a bill", there's no separate
 * bill.pay() endpoint. Paying by check/bank transfer (PayType: 'Check') is
 * the common case; QuickBooks also supports paying by credit card, which
 * this app doesn't expose yet.
 */
export async function payBill(input: PayBillInput): Promise<BillPayment> {
  const data = await qboFetch<{ BillPayment: BillPayment }>('billpayment', {
    method: 'POST',
    body: {
      VendorRef: { value: input.vendorId, name: input.vendorName },
      TotalAmt: input.amount,
      PayType: 'Check',
      CheckPayment: {
        BankAccountRef: { value: input.bankAccountId, name: input.bankAccountName },
      },
      Line: [
        {
          Amount: input.amount,
          LinkedTxn: [{ TxnId: input.billId, TxnType: 'Bill' }],
        },
      ],
    },
  });
  return data.BillPayment;
}
