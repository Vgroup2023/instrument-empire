import { qboFetch, qboQuery } from '@/lib/quickbooks/client';

export interface Currency {
  /** ISO currency code, e.g. "EUR" — this is also QuickBooks' CompanyCurrency.Id. */
  code: string;
  name: string;
}

/** Lists currencies enabled for this company (Settings → Currencies in QuickBooks), including the home currency. */
export async function listCompanyCurrencies(): Promise<Currency[]> {
  const rows = await qboQuery<{ Id: string; Name: string }>(
    'SELECT * FROM CompanyCurrency WHERE Active = true ORDERBY Name MAXRESULTS 100',
  );
  return rows.map((r) => ({ code: r.Id, name: r.Name }));
}

/** The company's home/base currency — everything in Insights/reports is always in this currency. */
export async function getHomeCurrency(): Promise<Currency> {
  const data = await qboFetch<{
    Preferences?: { CurrencyPrefs?: { HomeCurrency?: { value: string; name?: string } } };
  }>('preferences');
  const home = data.Preferences?.CurrencyPrefs?.HomeCurrency;
  return { code: home?.value ?? 'USD', name: home?.name ?? home?.value ?? 'USD' };
}

/**
 * Loads company currencies + home currency together, defensively — this is
 * only relevant for companies with multi-currency enabled; on any other
 * company this either returns just the home currency or the underlying
 * query behaves unpredictably, so a failure here shouldn't take down a
 * whole page over what's an optional feature for most companies.
 */
export async function loadCurrencies(): Promise<{ currencies: Currency[]; homeCurrency: Currency | null }> {
  try {
    const [currencies, homeCurrency] = await Promise.all([listCompanyCurrencies(), getHomeCurrency()]);
    return { currencies, homeCurrency };
  } catch {
    return { currencies: [], homeCurrency: null };
  }
}

/**
 * Looks up today's exchange rate for a currency relative to home currency,
 * via QuickBooks' own ExchangeRate resource — used only to pre-fill a
 * sensible default in the UI, which the user can still type over. Returns
 * null on any failure (unsupported currency, no rate published yet, an
 * unexpected response shape) rather than blocking the transaction on it.
 */
export async function getExchangeRate(currencyCode: string): Promise<number | null> {
  try {
    const data = await qboFetch<{ ExchangeRate?: { Rate?: number } }>('exchangerate', {
      query: { sourcecurrencycode: currencyCode },
    });
    return data.ExchangeRate?.Rate ?? null;
  } catch {
    return null;
  }
}
