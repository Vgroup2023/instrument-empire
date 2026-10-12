import { getDb } from '@/db/client';
import { payrollEmployees } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
import {
  NotFoundError,
  asRecord,
  isoDate,
  money,
  oneOf,
  optEmail,
  optText,
  text,
  uuid,
} from '@/lib/validation';

// This is the standalone, database-backed employee directory behind
// src/lib/quickbooks/payroll.ts's PAYROLL_PROVIDER=mock path (the default —
// QuickBooks Payroll requires its own separate product access, which this
// app doesn't have wired up). It used to be a JSON file
// (src/lib/store/jsonStore.ts), which didn't survive on a serverless host
// like Netlify; now it's a real, persistent table.

export type EmploymentStatus = 'active' | 'terminated' | 'pending';
export type PayPeriod = 'hourly' | 'salary-annual';

export interface BasePay {
  amount: number;
  period: PayPeriod;
}

export interface Employee {
  id: string;
  displayName: string;
  email?: string;
  jobTitle?: string;
  department?: string;
  hiredDate: string;
  status: EmploymentStatus;
  basePay: BasePay;
}

type EmployeeRow = typeof payrollEmployees.$inferSelect;

function toEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    displayName: row.displayName,
    email: row.email ?? undefined,
    jobTitle: row.jobTitle ?? undefined,
    department: row.department ?? undefined,
    hiredDate: row.hiredDate,
    status: row.status,
    basePay: { amount: Number(row.basePayAmount), period: row.basePayPeriod },
  };
}

export async function listEmployees(): Promise<Employee[]> {
  const db = getDb();
  const rows = await db.select().from(payrollEmployees).orderBy(asc(payrollEmployees.displayName));
  return rows.map(toEmployee);
}

const PAY_PERIODS = ['hourly', 'salary-annual'] as const;
const EMPLOYMENT_STATUSES = ['active', 'terminated', 'pending'] as const;

export function parseBasePay(raw: unknown): BasePay {
  const pay = asRecord(raw, 'Base pay');
  return {
    amount: money(pay.amount, 'Base pay amount', { allowZero: true }),
    period: oneOf(pay.period, 'Pay period', PAY_PERIODS),
  };
}

export function parseEmploymentStatus(raw: unknown): EmploymentStatus {
  return oneOf(raw, 'Status', EMPLOYMENT_STATUSES);
}

export async function getEmployee(id: string): Promise<Employee | null> {
  uuid(id, 'Employee');
  const db = getDb();
  const [row] = await db.select().from(payrollEmployees).where(eq(payrollEmployees.id, id));
  return row ? toEmployee(row) : null;
}

export interface CreateEmployeeInput {
  displayName: string;
  email?: string;
  jobTitle?: string;
  department?: string;
  hiredDate: string;
  basePay: BasePay;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const raw = asRecord(input, 'The employee');
  const displayName = text(raw.displayName, 'Name', { max: 120 });
  const email = optEmail(raw.email, 'Email');
  const jobTitle = optText(raw.jobTitle, 'Job title', 120);
  const department = optText(raw.department, 'Department', 120);
  const hiredDate = isoDate(raw.hiredDate, 'Hire date');
  const basePay = parseBasePay(raw.basePay);
  const db = getDb();
  const [row] = await db
    .insert(payrollEmployees)
    .values({
      displayName,
      email: email ?? null,
      jobTitle: jobTitle ?? null,
      department: department ?? null,
      hiredDate,
      basePayAmount: basePay.amount.toFixed(2),
      basePayPeriod: basePay.period,
    })
    .returning();
  return toEmployee(row);
}

export async function setEmployeeBasePay(id: string, rawBasePay: BasePay): Promise<Employee> {
  uuid(id, 'Employee');
  const basePay = parseBasePay(rawBasePay);
  const db = getDb();
  const [row] = await db
    .update(payrollEmployees)
    .set({ basePayAmount: basePay.amount.toFixed(2), basePayPeriod: basePay.period, updatedAt: new Date() })
    .where(eq(payrollEmployees.id, id))
    .returning();
  if (!row) throw new NotFoundError('Employee not found.');
  return toEmployee(row);
}

export interface UpdateEmployeeInput {
  displayName?: string;
  email?: string;
  jobTitle?: string;
  department?: string;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  uuid(id, 'Employee');
  const db = getDb();
  const patch: Partial<EmployeeRow> = { updatedAt: new Date() };
  if (input.displayName !== undefined) patch.displayName = text(input.displayName, 'Name', { max: 120 });
  if (input.email !== undefined) patch.email = optEmail(input.email, 'Email') ?? null;
  if (input.jobTitle !== undefined) patch.jobTitle = optText(input.jobTitle, 'Job title', 120) ?? null;
  if (input.department !== undefined) patch.department = optText(input.department, 'Department', 120) ?? null;

  const [row] = await db.update(payrollEmployees).set(patch).where(eq(payrollEmployees.id, id)).returning();
  if (!row) throw new NotFoundError('Employee not found.');
  return toEmployee(row);
}

/** Terminating/reactivating is this app's own status field — there's no hard-delete for an employee record. */
export async function setEmployeeStatus(id: string, rawStatus: EmploymentStatus): Promise<Employee> {
  uuid(id, 'Employee');
  const status = parseEmploymentStatus(rawStatus);
  const db = getDb();
  const [row] = await db
    .update(payrollEmployees)
    .set({ status, updatedAt: new Date() })
    .where(eq(payrollEmployees.id, id))
    .returning();
  if (!row) throw new NotFoundError('Employee not found.');
  return toEmployee(row);
}

export interface PayrollSummary {
  totalEmployees: number;
  activeEmployees: number;
  lastPayrollRunDate: string | null;
  lastPayrollGross: number | null;
  nextPayrollDate: string | null;
}

export async function getPayrollSummary(): Promise<PayrollSummary> {
  const employees = await listEmployees();
  const active = employees.filter((e) => e.status === 'active');
  return {
    totalEmployees: employees.length,
    activeEmployees: active.length,
    // This app doesn't run actual payroll (that requires QuickBooks
    // Payroll product access — see PAYROLL_PROVIDER=live), so there's no
    // real payroll-run history to report yet.
    lastPayrollRunDate: null,
    lastPayrollGross: null,
    nextPayrollDate: null,
  };
}
