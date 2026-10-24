import { computeCanada } from './canada';
import { computeUs } from './us';
import type { Country, TaxInputs, TaxResult } from './types';

export * from './types';
export { FILING_STATUSES, US_2025 } from './us';
export { PROVINCES, CA_2025 } from './canada';

export function computeReturn(country: Country, inputs: TaxInputs): TaxResult {
  return country === 'CA' ? computeCanada(inputs) : computeUs(inputs);
}
