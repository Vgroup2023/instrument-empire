import { NextRequest, NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';
import { ValidationError } from '@/lib/validation';
import { loadRulesView, savePriorJob, savePrice, saveRoutingRule, saveSettings } from '@/lib/quoting/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await loadRulesView());
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** POST { kind: settings | price | routing | job, ...fields }. Saving an existing material+vendor or operation updates it. */
export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    switch (body.kind) {
      case 'settings':
        return NextResponse.json({ settings: await saveSettings(body) });
      case 'price':
        await savePrice(body);
        break;
      case 'routing':
        await saveRoutingRule(body);
        break;
      case 'job':
        await savePriorJob(body);
        break;
      default:
        throw new ValidationError('Unknown rule type.');
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
