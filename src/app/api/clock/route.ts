import { NextRequest, NextResponse } from 'next/server';
import { clock } from '@/lib/workforce/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { clearAttempts, getClientKey, isRateLimited, recordFailedAttempt } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public on purpose: staff clock in from their own phone with a staff ID and PIN, without the office password.
// It can only clock the person in or out and show their own week. Wrong guesses are slowed down per address here,
// and per person in the database (five wrong PINs lock that person for 15 minutes).
export async function POST(request: NextRequest) {
  const key = `clock:${getClientKey(request)}`;
  try {
    if (isRateLimited(key)) {
      return NextResponse.json({ error: 'Too many tries. Please wait a few minutes.' }, { status: 429 });
    }
    const body = await readJson(request, 2_000);
    try {
      const result = await clock(body.staffCode, body.pin, body.mealMinutes);
      clearAttempts(key);
      return NextResponse.json({ result }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      recordFailedAttempt(key);
      throw err;
    }
  } catch (err) {
    return apiErrorResponse(err);
  }
}
