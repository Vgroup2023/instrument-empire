import { NextRequest, NextResponse } from 'next/server';
import { runDueTemplates } from '@/lib/accounting/recurring';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Meant to be called once a day by an external scheduler (cron job,
 * platform scheduled function, GitHub Actions schedule, etc.), not by the
 * browser — hence the separate CRON_SECRET instead of the app's login
 * cookie. Example: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/recurring/run-due`.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided = request.headers.get('authorization')?.replace('Bearer ', '');
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const results = await runDueTemplates();
    return NextResponse.json({ results });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
