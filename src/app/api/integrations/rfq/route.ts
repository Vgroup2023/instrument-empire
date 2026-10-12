import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { createRfq, type CreateRfqInput } from '@/lib/quoting/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 26;

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Inbound RFQs from an email-to-webhook service, an ERP or a customer portal. POST with
 * "Authorization: Bearer $INTEGRATION_KEY":
 *   { customerName, contactEmail?, subject?, rawText?, dueDate?, files?: [{ fileName, contentType, contentBase64 }], parts?: [...] }
 * The RFQ is read, costed and held for estimator review; nothing is sent to anyone. Disabled until INTEGRATION_KEY is set.
 */
export async function POST(request: NextRequest) {
  const key = process.env.INTEGRATION_KEY;
  const provided = request.headers.get('authorization')?.replace('Bearer ', '') ?? '';
  if (!key || !sameSecret(provided, key)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = (await readJson(request, 7_000_000)) as unknown as CreateRfqInput;
    return NextResponse.json(await createRfq(body, 'integration'));
  } catch (err) {
    return apiErrorResponse(err);
  }
}
