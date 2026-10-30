import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current';
import { readJson } from '@/lib/http';

/**
 * The request body, with `actor` set to the signed-in person's own name so the activity log cannot be written in
 * someone else's name. Without a personal account (shared passphrase) the name the browser sent is kept.
 */
export async function readJsonAsUser(request: NextRequest): Promise<unknown> {
  const body = await readJson(request);
  const me = await getCurrentUser().catch(() => null);
  if (me?.id && body && typeof body === 'object' && !Array.isArray(body)) return { ...(body as Record<string, unknown>), actor: me.name };
  return body;
}
