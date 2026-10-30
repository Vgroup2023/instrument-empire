import { NextRequest, NextResponse } from 'next/server';
import { activitiesFor, logActivity } from '@/lib/crm/service';
import { apiErrorResponse } from '@/lib/apiError';
import { readJsonAsUser } from '@/lib/crm/signedBody';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    return NextResponse.json({ activities: await activitiesFor({ dealId: p.get('dealId') ?? undefined, contactId: p.get('contactId') ?? undefined }) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json({ activity: await logActivity(await readJsonAsUser(request)) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
