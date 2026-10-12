import { NextRequest, NextResponse } from 'next/server';
import {
  getEmployee,
  setEmployeeBasePay,
  setEmployeeStatus,
  updateEmployee,
  type EmploymentStatus,
} from '@/lib/quickbooks/payroll';
import { parseBasePay, parseEmploymentStatus } from '@/lib/accounting/payroll';
import { apiErrorResponse } from '@/lib/apiError';
import { readJson } from '@/lib/http';

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
    const body = (await readJson(request)) as unknown as {
      basePay?: { amount: number; period: 'hourly' | 'salary-annual' };
      status?: EmploymentStatus;
      displayName?: string;
      email?: string;
      jobTitle?: string;
      department?: string;
    };
    // Validate every part up front so a bad field can't leave a half-applied update.
    if (body.basePay) parseBasePay(body.basePay);
    if (body.status) parseEmploymentStatus(body.status);
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
