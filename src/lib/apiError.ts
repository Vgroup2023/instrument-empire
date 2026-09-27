import { NextResponse } from 'next/server';
import { QboApiError, QboNotConnectedError } from '@/lib/quickbooks/client';

export function apiErrorResponse(err: unknown): NextResponse {
  if (err instanceof QboNotConnectedError) {
    return NextResponse.json({ error: err.message, code: 'not_connected' }, { status: 409 });
  }
  if (err instanceof QboApiError) {
    return NextResponse.json({ error: 'QuickBooks rejected the request.', details: err.body }, {
      status: err.status >= 400 && err.status < 600 ? err.status : 502,
    });
  }
  const message = err instanceof Error ? err.message : 'Unexpected error.';
  return NextResponse.json({ error: message }, { status: 500 });
}
