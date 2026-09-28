import { NextRequest, NextResponse } from 'next/server';
import { getEmployee, setEmployeeBasePay } from '@/lib/quickbooks/payroll';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const employee = await getEmployee(id);
    if (!employee) return NextResponse.json({ error: 'Employee not found.' }, { status: 404 });
    return NextResponse.json({ employee });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { basePay: { amount: number; period: 'hourly' | 'salary-annual' } };
    const employee = await setEmployeeBasePay(id, body.basePay);
    return NextResponse.json({ employee });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
