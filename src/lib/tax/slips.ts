import type Anthropic from '@anthropic-ai/sdk';
import { askJson, str, type LlmClient } from '@/lib/llm/json';
import { ValidationError } from '@/lib/validation';
import type { Country } from './types';
import { MAX_SLIP_BYTES, SLIP_BOXES, SLIP_MIME, type ExtractedSlip, type SlipMime } from './slipTypes';

export { MAX_SLIP_BYTES, SLIP_BOXES, SLIP_MIME };
export type { ExtractedSlip, SlipMime };

// Reads a W-2 (United States) or T4 (Canada) from a photo or PDF with Claude and returns the few boxes the
// return needs. Nothing it reads is trusted: each number is range-checked, cross-checked, and shown to the
// person to confirm before it touches the return. The file itself is never stored, and identity numbers
// (Social Security, Social Insurance, employer ID) are never requested.

const CPP_MAX = 4034.1;
const EI_MAX = 1077.48;


/** Pure: keeps only sane numbers for the boxes we asked about and adds plain-language warnings. */
export function validateSlip(raw: unknown, country: Country): ExtractedSlip | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const boxes = r.boxes && typeof r.boxes === 'object' ? (r.boxes as Record<string, unknown>) : null;
  if (!boxes) return null;
  const slipType = r.slip_type === 'W-2' || r.slip_type === 'T4' ? r.slip_type : null;
  const values: Record<string, number> = {};
  for (const { box, key } of SLIP_BOXES[country]) {
    const v = boxes[box];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e8) values[key] = Math.round(v * 100) / 100;
  }
  const warnings: string[] = [];
  const expected = country === 'US' ? 'W-2' : 'T4';
  if (slipType && slipType !== expected) warnings.push(`This looks like a ${slipType}, but this is a ${country === 'US' ? 'U.S.' : 'Canadian'} return. Check you opened the right one.`);
  if (Object.keys(values).length === 0) warnings.push("Couldn't read any amounts from this file. Try a sharper, straight-on photo or the PDF.");
  if (country === 'US') {
    if (values.wages !== undefined && values.wageWithholding !== undefined && values.wageWithholding > values.wages) warnings.push('Tax withheld is larger than wages. One of the two numbers was probably misread.');
  } else {
    if (values.cppPaid !== undefined && values.cppPaid > CPP_MAX) warnings.push(`CPP of ${values.cppPaid} is above the 2025 yearly maximum of ${CPP_MAX}. Check box 16.`);
    if (values.eiPaid !== undefined && values.eiPaid > EI_MAX) warnings.push(`EI of ${values.eiPaid} is above the 2025 yearly maximum of ${EI_MAX}. Check box 18.`);
    if (values.employmentIncome !== undefined && values.taxDeducted !== undefined && values.taxDeducted > values.employmentIncome) warnings.push('Tax deducted is larger than income. One of the two numbers was probably misread.');
  }
  return { slipType, employer: str(r.employer, 120) ?? null, values, warnings };
}

export async function readSlip(base64: string, mime: SlipMime, country: Country, client?: LlmClient): Promise<ExtractedSlip | null> {
  const file: Anthropic.ContentBlockParam =
    mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } };
  const boxes = SLIP_BOXES[country].map((b) => `"${b.box}"`).join(', ');
  const raw = await askJson(
    'You read tax slips and copy exactly what is printed. You never return identity numbers, addresses or names of people.',
    [
      file,
      {
        type: 'text',
        text: `This should be a ${country === 'US' ? 'U.S. Form W-2' : 'Canadian T4 slip'}. Return {"slip_type": "W-2"|"T4"|null, "employer": string|null, "boxes": {${boxes}: number|null}} using the amount printed in each numbered box, as a plain number with no currency symbol or commas. Use null for a box that is empty or unreadable. Do not return Social Security numbers, Social Insurance numbers, employer ID numbers, or addresses. If this is not a W-2 or T4, set slip_type to null.`,
      },
    ],
    { client, maxTokens: 1000, effort: 'medium' },
  );
  return validateSlip(raw, country);
}

export function slipMimeOf(fileName: string, mime: string): SlipMime | null {
  if ((SLIP_MIME as readonly string[]).includes(mime)) return mime as SlipMime;
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return null;
}

/** Validates an upload request and reads the slip. Throws plain-language ValidationErrors. */
export async function readSlipUpload(raw: Record<string, unknown>, aiEnabled: boolean, client?: LlmClient): Promise<ExtractedSlip> {
  const country: Country = raw.country === 'CA' ? 'CA' : raw.country === 'US' ? 'US' : (() => { throw new ValidationError('Choose a country.'); })();
  const fileName = typeof raw.fileName === 'string' ? raw.fileName : '';
  const mime = slipMimeOf(fileName, typeof raw.mimeType === 'string' ? raw.mimeType : '');
  if (!mime) throw new ValidationError('Upload a PDF, PNG or JPG of the slip.');
  const data = typeof raw.data === 'string' ? raw.data : '';
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length === 0) throw new ValidationError('That file is empty.');
  if (bytes.length > MAX_SLIP_BYTES) throw new ValidationError('That file is over 4 MB. Try a smaller photo.');
  if (!aiEnabled) throw new ValidationError('Reading a slip needs Claude, which is off (no Anthropic key). Type the boxes in by hand instead.');
  const slip = await readSlip(data, mime, country, client);
  if (!slip) throw new ValidationError("Couldn't read that file. Try a sharper photo or the PDF, or type the boxes in by hand.");
  return slip;
}
