import { qboQuery } from '@/lib/quickbooks/client';

export interface GlAccount {
  Id: string;
  Name: string;
}

/**
 * Lists Expense / Cost of Goods Sold / Other Expense accounts, so the "add
 * bill" form can let the user pick which one a line item posts to — same
 * reasoning as products' income-account picker: guessing wrong here would
 * miscategorize a real expense in their books.
 */
export async function listExpenseAccounts(): Promise<GlAccount[]> {
  return qboQuery<GlAccount>(
    "SELECT * FROM Account WHERE AccountType IN ('Expense', 'Cost of Goods Sold', 'Other Expense') AND Active = true ORDERBY Name MAXRESULTS 200",
  );
}

/**
 * Lists Bank accounts, so "pay bill" can let the user pick which account the
 * payment actually comes out of.
 */
export async function listBankAccounts(): Promise<GlAccount[]> {
  return qboQuery<GlAccount>(
    "SELECT * FROM Account WHERE AccountType = 'Bank' AND Active = true ORDERBY Name MAXRESULTS 100",
  );
}

/**
 * Lists Bank and Credit Card accounts — the accounts real money can move
 * out of or between. Used for "record an expense" (paid from either kind
 * of account) and bank transfers (between two of either kind).
 */
export async function listPaymentAccounts(): Promise<GlAccount[]> {
  return qboQuery<GlAccount>(
    "SELECT * FROM Account WHERE AccountType IN ('Bank', 'Credit Card') AND Active = true ORDERBY Name MAXRESULTS 100",
  );
}
