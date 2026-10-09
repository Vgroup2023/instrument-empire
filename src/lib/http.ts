import { ValidationError, asRecord } from '@/lib/validation';

const MAX_BODY_BYTES = 1_000_000;

async function readText(request: Request, limit = MAX_BODY_BYTES): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > limit) throw new ValidationError('That request is too large.');
  const raw = await request.text();
  if (raw.length > limit) throw new ValidationError('That request is too large.');
  return raw;
}

/** The JSON body of a request, which must be an object. Anything else is a 400, never a crash. */
export async function readJson(request: Request, limit = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  const raw = await readText(request, limit);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError('The request body must be valid JSON.');
  }
  return asRecord(parsed);
}

/** Like readJson, but an empty body is fine and gives an empty object. */
export async function readOptionalJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await readText(request);
  if (!raw.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError('The request body must be valid JSON.');
  }
  return asRecord(parsed);
}
