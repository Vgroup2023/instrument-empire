/**
 * QuickBooks' Account entity requires both an AccountType and a more
 * specific AccountSubType on creation. Intuit supports several hundred
 * subtypes in total; this is a curated set of the common ones per type —
 * enough to cover real day-to-day chart-of-accounts setup without making
 * the "add account" form unusable. Anything more exotic can still be
 * created directly in QuickBooks itself and will show up here to edit.
 */
export const ACCOUNT_TYPES = [
  'Bank',
  'Accounts Receivable',
  'Other Current Asset',
  'Fixed Asset',
  'Other Asset',
  'Accounts Payable',
  'Credit Card',
  'Long Term Liability',
  'Other Current Liability',
  'Equity',
  'Income',
  'Cost of Goods Sold',
  'Expense',
  'Other Expense',
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_SUBTYPES: Record<AccountType, { value: string; label: string }[]> = {
  Bank: [
    { value: 'Checking', label: 'Checking' },
    { value: 'Savings', label: 'Savings' },
    { value: 'CashOnHand', label: 'Cash on hand' },
  ],
  'Accounts Receivable': [{ value: 'AccountsReceivable', label: 'Accounts receivable (A/R)' }],
  'Other Current Asset': [
    { value: 'Inventory', label: 'Inventory' },
    { value: 'PrepaidExpenses', label: 'Prepaid expenses' },
    { value: 'UndepositedFunds', label: 'Undeposited funds' },
    { value: 'OtherCurrentAssets', label: 'Other current assets' },
  ],
  'Fixed Asset': [
    { value: 'FurnitureAndFixtures', label: 'Furniture & fixtures' },
    { value: 'MachineryAndEquipment', label: 'Machinery & equipment' },
    { value: 'Vehicles', label: 'Vehicles' },
    { value: 'AccumulatedDepreciation', label: 'Accumulated depreciation' },
    { value: 'OtherFixedAssets', label: 'Other fixed assets' },
  ],
  'Other Asset': [
    { value: 'SecurityDeposits', label: 'Security deposits' },
    { value: 'OtherLongTermAssets', label: 'Other long-term assets' },
  ],
  'Accounts Payable': [{ value: 'AccountsPayable', label: 'Accounts payable (A/P)' }],
  'Credit Card': [{ value: 'CreditCard', label: 'Credit card' }],
  'Long Term Liability': [
    { value: 'NotesPayable', label: 'Notes payable' },
    { value: 'OtherLongTermLiabilities', label: 'Other long-term liabilities' },
  ],
  'Other Current Liability': [
    { value: 'PayrollTaxPayable', label: 'Payroll tax payable' },
    { value: 'SalesTaxPayable', label: 'Sales tax payable' },
    { value: 'LineOfCredit', label: 'Line of credit' },
    { value: 'OtherCurrentLiabilities', label: 'Other current liabilities' },
  ],
  Equity: [
    { value: 'OpeningBalanceEquity', label: 'Opening balance equity' },
    { value: 'RetainedEarnings', label: 'Retained earnings' },
    { value: 'OwnersEquity', label: "Owner's equity" },
    { value: 'PartnersEquity', label: "Partner's equity" },
  ],
  Income: [
    { value: 'SalesOfProductIncome', label: 'Sales of product income' },
    { value: 'ServiceFeeIncome', label: 'Service/fee income' },
    { value: 'OtherPrimaryIncome', label: 'Other primary income' },
  ],
  'Cost of Goods Sold': [
    { value: 'SuppliesMaterialsCogs', label: 'Supplies & materials — COGS' },
    { value: 'CostOfLaborCogs', label: 'Cost of labor — COGS' },
    { value: 'OtherCostsOfServicesCogs', label: 'Other costs of services — COGS' },
  ],
  Expense: [
    { value: 'AdvertisingPromotional', label: 'Advertising/promotional' },
    { value: 'OfficeGeneralAdministrativeExpenses', label: 'Office/general administrative' },
    { value: 'TravelMeals', label: 'Travel & meals' },
    { value: 'Utilities', label: 'Utilities' },
    { value: 'Insurance', label: 'Insurance' },
    { value: 'RentOrLeaseOfBuildings', label: 'Rent or lease' },
    { value: 'OtherMiscellaneousServiceCost', label: 'Other miscellaneous expense' },
  ],
  'Other Expense': [
    { value: 'OtherMiscellaneousExpense', label: 'Other miscellaneous expense' },
    { value: 'PenaltiesSettlements', label: 'Penalties & settlements' },
  ],
};
