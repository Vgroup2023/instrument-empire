import { NextRequest, NextResponse } from 'next/server';
import {
  getEmployee,
  setEmployeeBasePay,
  setEmployeeStatus,
  updateEmployee,
  type EmploymentStatus,
} from '@/lib/quickbooks/payroll';
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
    const body = (await request.json()) as {
      basePay?: { amount: number; period: 'hourly' | 'salary-annual' };
      status?: EmploymentStatus;
      displayName?: string;
      email?: string;
      jobTitle?: string;
      department?: string;
    };
    let employee = null;
    if (body.basePay) {
      employee = await setEmployeeBasePay(id, body.basePay);
    }
    if (body.status) {
      employee = await setEmployeeStatus(id, body.status);
    }
    if (body.displayName !== undefined || body.email !== undefined || body.jobTitle !== undefined || body.department !== undefined) {
      employee = await updateEmployee(id, {
        displayName: body.displayName,
        email: body.email,
        jobTitle: body.jobTitle,
        department: body.department,
      });
    }
    if (!employee) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }
    return NextResponse.json({ employee });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
