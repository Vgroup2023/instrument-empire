import type Anthropic from '@anthropic-ai/sdk';
import { askJson, str, type LlmClient } from '@/lib/llm/json';
import { parseStatementCsv, type StatementLine } from '@/lib/accounting/reconciliation';
import { ValidationError } from '@/lib/validation';

// Turns an uploaded bank or card statement into lines. CSV and OFX/QFX (what most banks export for
// accounting software) are read exactly, with no AI. A PDF or a photo is read by Claude, and every
// line it finds still lands in the review queue for a person to approve.

export const MAX_STATEMENT_BYTES = 4 * 1024 * 1024;
export type StatementKind = 'csv' | 'ofx' | 'pdf' | 'image';

const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;

export function statementKind(fileName: string, mime: string): StatementKind | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'ofx' || ext === 'qfx') return 'ofx';
  if (ext === 'csv' || mime === 'text/csv') return 'csv';
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext) || (IMAGE_MIME as readonly string[]).includes(mime)) return 'image';
  return null;
}

const tag = (block: string, name: string): string | undefined => {
  // OFX 1.x has no closing tags (<NAME>Store\n); OFX 2 does (<NAME>Store</NAME>). Either way the value ends at "<" or a line break.
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim() : undefined;
};

/** Pure: reads the transactions out of an OFX or QFX file. Amounts keep the file's sign (money out is negative). */
export function parseOfx(textIn: string): StatementLine[] {
  const blocks = textIn.split(/<STMTTRN>/i).slice(1);
  const lines: StatementLine[] = [];
  for (const [i, raw] of blocks.entries()) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const posted = tag(block, 'DTPOSTED')?.match(/^(\d{4})(\d{2})(\d{2})/);
    const amount = Number((tag(block, 'TRNAMT') ?? '').replace(',', '.'));
    if (!posted || !Number.isFinite(amount)) throw new ValidationError(`Transaction ${i + 1} in the OFX file has no usable date or amount.`);
    const description = [tag(block, 'NAME'), tag(block, 'MEMO')].filter(Boolean).join(' ').trim() || '(no description)';
    lines.push({ date: `${posted[1]}-${posted[2]}-${posted[3]}`, description, amount });
  }
  return lines;
}

/** Pure: keeps only well-formed lines from what the model returned. */
export function validateAiLines(raw: unknown): StatementLine[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { transactions?: unknown }).transactions)) return [];
  const out: StatementLine[] = [];
  for (const t of (raw as { transactions: unknown[] }).transactions.slice(0, 1000)) {
    if (!t || typeof t !== 'object') continue;
    const x = t as Record<string, unknown>;
    const date = typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null;
    const description = str(x.description, 300);
    const amount = typeof x.amount === 'number' && Number.isFinite(x.amount) && x.amount !== 0 ? Math.round(x.amount * 100) / 100 : null;
    if (date && description && amount !== null) out.push({ date, description, amount });
  }
  return out;
}

export async function readStatementWithAi(base64: string, kind: 'pdf' | 'image', mime: string, client?: LlmClient): Promise<StatementLine[]> {
  const file: Anthropic.ContentBlockParam =
    kind === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mime as (typeof IMAGE_MIME)[number], data: base64 } };
  const raw = await askJson(
    'You copy the transaction list out of a bank or credit card statement for a bookkeeper. You copy exactly what is printed and never invent or total anything.',
    [
      file,
      {
        type: 'text',
        text: 'List every individual transaction on this statement. Return {"transactions": [{"date": "YYYY-MM-DD", "description": string, "amount": number}]}. Money leaving the account (purchases, withdrawals, fees, interest charged) is a NEGATIVE amount. Money coming in (deposits, payments received, refunds) is POSITIVE. Skip opening and closing balances, totals and summaries. If a date has no year, use the statement period to work it out.',
      },
    ],
    { client, maxTokens: 12000, effort: 'medium' },
  );
  return validateAiLines(raw);
}

/** Reads any supported statement file into lines. `base64` is the file's bytes. */
export async function readStatementFile(opts: { fileName: string; mimeType: string; base64: string; aiEnabled: boolean; client?: LlmClient }): Promise<StatementLine[]> {
  const kind = statementKind(opts.fileName, opts.mimeType);
  if (!kind) throw new ValidationError('Upload a CSV, OFX/QFX, PDF or image (PNG, JPG) of the statement.');
  const bytes = Buffer.from(opts.base64, 'base64');
  if (bytes.length === 0) throw new ValidationError('That file is empty.');
  if (bytes.length > MAX_STATEMENT_BYTES) throw new ValidationError('That file is over 4 MB. Export a shorter date range.');

  if (kind === 'csv') return parseStatementCsv(bytes.toString('utf8').replace(/^﻿/, ''));
  if (kind === 'ofx') return parseOfx(bytes.toString('utf8'));

  if (!opts.aiEnabled) {
    throw new ValidationError('Reading a PDF or photo needs Claude, which is off (no Anthropic key). Export a CSV or OFX file from your bank instead.');
  }
  const lines = await readStatementWithAi(opts.base64, kind, opts.mimeType, opts.client);
  if (lines.length === 0) throw new ValidationError("Couldn't find any transactions in that file. A CSV or OFX export from your bank is the most reliable.");
  return lines;
}
