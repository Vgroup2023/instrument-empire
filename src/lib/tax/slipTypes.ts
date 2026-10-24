import type { Country } from './types';

// Slip constants that the browser and the server both need. Kept apart from slips.ts, which pulls in the Claude SDK.

export const MAX_SLIP_BYTES = 4 * 1024 * 1024;
export const SLIP_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'] as const;
export type SlipMime = (typeof SLIP_MIME)[number];

/** Which slip box feeds which interview answer. */
export const SLIP_BOXES: Record<Country, { box: string; key: string; label: string }[]> = {
  US: [
    { box: '1', key: 'wages', label: 'Wages, tips, other compensation (box 1)' },
    { box: '2', key: 'wageWithholding', label: 'Federal income tax withheld (box 2)' },
  ],
  CA: [
    { box: '14', key: 'employmentIncome', label: 'Employment income (box 14)' },
    { box: '22', key: 'taxDeducted', label: 'Income tax deducted (box 22)' },
    { box: '16', key: 'cppPaid', label: 'CPP contributions (box 16)' },
    { box: '18', key: 'eiPaid', label: 'EI premiums (box 18)' },
    { box: '44', key: 'unionDues', label: 'Union dues (box 44)' },
  ],
};


export interface ExtractedSlip {
  slipType: 'W-2' | 'T4' | null;
  employer: string | null;
  /** Interview answer key -> amount read from the slip. */
  values: Record<string, number>;
  warnings: string[];
}
