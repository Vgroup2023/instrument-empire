import type Anthropic from '@anthropic-ai/sdk';
import { askJson, llmEnabled, str, type LlmClient } from '@/lib/llm/json';
import { canonicalMaterial } from './materials';
import { toIsoDate, type ExtractedRfq } from './extract';
import type { PartInput } from './types';

// With an Anthropic key set, Claude reads the RFQ text and the attached drawings (PDF and image
// files) and returns the parts, material, operations, tolerances, due date and certifications. Every
// field is checked here before use, and anything the model could not find stays blank. Without a key,
// or on any failure, the caller falls back to the plain-rule reader in extract.ts.

export interface AttachedFile {
  fileName: string;
  contentType: string;
  contentBase64: string;
  fileSize: number;
}

const MAX_READ_FILES = 3;
const MAX_READ_BYTES = 3 * 1024 * 1024;

const SYSTEM = `You read a manufacturer's request for quote (RFQ) and any attached drawings for a machine shop's estimator.
Return JSON: {"parts":[{"partNumber":string|null,"description":string,"material":string|null,"qty":integer|null,"operations":[string],"weightLb":number|null,"finish":string|null,"notes":string|null}],"dueDate":"YYYY-MM-DD"|null,"certifications":[string]}.
Use only what the request or drawings state. Operations are shop operations such as milling, turning, drilling, tapping, finishing, grinding, welding, inspection. weightLb is the finished part weight in pounds only if it is stated. Put tolerances, surface finish callouts and special notes in "notes". Never invent values.`;

/** Which attached files Claude can be shown (PDF and common image types, small enough). */
export function readableFiles(files: AttachedFile[]): AttachedFile[] {
  return files
    .filter((f) => f.fileSize <= MAX_READ_BYTES && /^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(f.contentType))
    .slice(0, MAX_READ_FILES);
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e6 ? v : null;
}

export function validateReading(raw: unknown): ExtractedRfq | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const parts: PartInput[] = [];
  if (Array.isArray(o.parts)) {
    for (const p of o.parts.slice(0, 200)) {
      if (!p || typeof p !== 'object') continue;
      const x = p as Record<string, unknown>;
      const description = str(x.description, 200) ?? str(x.partNumber, 200);
      const qty = typeof x.qty === 'number' && Number.isInteger(x.qty) && x.qty > 0 && x.qty <= 9_999_999 ? x.qty : null;
      if (!description || !qty) continue; // a part without a quantity is left for the estimator to add
      const notes = str(x.notes, 500);
      parts.push({
        partNumber: str(x.partNumber, 80)?.toUpperCase() ?? null,
        description,
        material: canonicalMaterial(str(x.material, 80) ?? null),
        qty,
        operations: Array.isArray(x.operations) ? x.operations.map((v) => str(v, 40)).filter((v): v is string => !!v).slice(0, 12) : [],
        weightLb: numberOrNull(x.weightLb),
        finish: str(x.finish, 120) ?? null,
        notes: notes ?? null,
      });
    }
  }
  let dueDate: string | null = null;
  const d = typeof o.dueDate === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(o.dueDate) : null;
  if (d) dueDate = toIsoDate(Number(d[1]), Number(d[2]), Number(d[3]));
  const certifications = Array.isArray(o.certifications) ? o.certifications.map((v) => str(v, 60)).filter((v): v is string => !!v).slice(0, 12) : [];
  return { parts, dueDate, certifications };
}

export async function readRfqWithLlm(text: string, files: AttachedFile[], client?: LlmClient): Promise<ExtractedRfq | null> {
  if (!client && !llmEnabled()) return null;
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const f of readableFiles(files)) {
    if (f.contentType === 'application/pdf') {
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.contentBase64 } });
    } else {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: f.contentType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', data: f.contentBase64 },
      });
    }
  }
  blocks.push({ type: 'text', text: `RFQ text:\n${text.slice(0, 20_000) || '(none)'}` });
  const raw = await askJson(SYSTEM, blocks, { client, maxTokens: 4000, effort: 'medium' });
  return validateReading(raw);
}
