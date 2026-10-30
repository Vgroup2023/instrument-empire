import { NextResponse } from 'next/server';
import { getCurrentUser, legacyAllowed } from '@/lib/auth/current';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ signedIn: false }, { status: 401 });
  const { anyUsers } = await legacyAllowed();
  return NextResponse.json({ signedIn: true, id: me.id, name: me.name, email: me.email, role: me.role, departments: me.departments, legacy: me.legacy, accountsExist: anyUsers });
}
