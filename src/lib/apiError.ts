import { NextResponse } from 'next/server';
import { QboApiError, QboNotConnectedError } from '@/lib/quickbooks/client';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/validation';

/** The Postgres error code (such as 23503), which postgres-js puts on the error or its cause. */
function pgCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

const DB_MESSAGES: Record<string, { status: number; error: string }> = {
  '23505': { status: 409, error: 'That already exists.' },
  '23503': { status: 400, error: "One of the records this entry points to doesn't exist. Check the customer, vendor, account or product you chose." },
  '23502': { status: 400, error: 'A required value is missing.' },
  '23514': { status: 400, error: 'One of the values entered is not allowed.' },
  '22P02': { status: 400, error: 'One of the values entered is not valid.' },
  '22003': { status: 400, error: 'One of the numbers entered is too large.' },
  '22001': { status: 400, error: 'One of the values entered is too long.' },
  '22007': { status: 400, error: 'One of the dates entered is not valid.' },
  '22008': { status: 400, error: 'One of the dates entered is not valid.' },
  '22023': { status: 400, error: 'One of the values entered is not valid.' },
  '57014': { status: 503, error: 'The database took too long to answer. Please try again.' },
  '53300': { status: 503, error: 'The system is busy. Please try again in a moment.' },
};

/**
 * Turns anything thrown by a route into a response. Entry mistakes become a
 * 4xx with a plain message. Anything unexpected becomes a generic 500: the
 * detail goes to the server log, never to the caller (database errors can
 * contain the SQL and the values that were being saved).
 */
export function apiErrorResponse(err: unknown): NextResponse {
  if (err instanceof QboNotConnectedError) {
    return NextResponse.json({ error: err.message, code: 'not_connected' }, { status: 409 });
  }
  if (err instanceof QboApiError) {
    return NextResponse.json({ error: 'QuickBooks rejected the request.', details: err.body }, {
      status: err.status >= 400 && err.status < 600 ? err.status : 502,
    });
  }
  if (err instanceof ValidationError || err instanceof NotFoundError || err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: 'The request body must be valid JSON.' }, { status: 400 });
  }
  const code = pgCode(err);
  const mapped = code ? DB_MESSAGES[code] : undefined;
  if (mapped) {
    console.warn(`[api] database rejected an entry (${code})`);
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
  console.error('[api] unexpected error', err);
  return NextResponse.json({ error: 'Something went wrong on our side. Please try again.' }, { status: 500 });
}
