'use client';

import { useState } from 'react';
import { Label, Input } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';

/**
 * Shown only when the selected customer/vendor's currency differs from the
 * company's home currency. The rate lookup is a button, not an automatic
 * fetch-on-change, so opening the form never fires a network call the user
 * didn't ask for — they can also just type the rate they already know.
 */
export function CurrencyExchangeRateField({
  currencyCode,
  homeCurrencyCode,
  exchangeRate,
  onExchangeRateChange,
}: {
  currencyCode: string;
  homeCurrencyCode?: string;
  exchangeRate: number;
  onExchangeRateChange: (rate: number) => void;
}) {
  const [looking, setLooking] = useState(false);

  async function lookupRate() {
    setLooking(true);
    try {
      const res = await fetch(`/api/currencies/exchange-rate?code=${encodeURIComponent(currencyCode)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.rate) onExchangeRateChange(data.rate);
      }
    } finally {
      setLooking(false);
    }
  }

  return (
    <div className="rounded-lg border border-gold-200 bg-gold-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone="brand">{currencyCode}</Badge>
          <p className="text-xs text-slate-600">Foreign currency — set the exchange rate below.</p>
        </div>
        <button
          type="button"
          onClick={lookupRate}
          disabled={looking}
          className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:text-slate-400"
        >
          {looking ? 'Looking up…' : "Use today's rate"}
        </button>
      </div>
      <Label htmlFor="exchangeRate">
        Exchange rate (1 {currencyCode} = ? {homeCurrencyCode ?? 'home currency'})
      </Label>
      <Input
        id="exchangeRate"
        type="number"
        min={0}
        step="0.0001"
        value={exchangeRate}
        onChange={(e) => onExchangeRateChange(Number(e.target.value))}
        required
      />
    </div>
  );
}
