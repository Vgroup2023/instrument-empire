import { NextRequest, NextResponse } from 'next/server';
import { createEmployee, listEmployees, type CreateEmployeeInput } from '@/lib/quickbooks/payroll';
import { apiErrorResponse } from '@/lib/apiError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const employees = await listEmployees();
    return NextResponse.json({ employees });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateEmployeeInput;
    if (!body.displayName || !body.hiredDate || !body.basePay) {
      return NextResponse.json({ error: 'Name, hire date, and base pay are required.' }, { status: 400 });
    }
    const employee = await createEmployee(body);
    return NextResponse.json({ employee });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
