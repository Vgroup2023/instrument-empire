import { providers } from '@/lib/config';
import {
  mockCreateEmployee,
  mockGetEmployee,
  mockGetPayrollSummary,
  mockListEmployees,
  mockSetBasePay,
} from '@/lib/quickbooks/mock/payroll';

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

export interface CreateEmployeeInput {
  displayName: string;
  email?: string;
  jobTitle?: string;
  department?: string;
  hiredDate: string;
  basePay: BasePay;
}

export interface PayrollSummary {
  totalEmployees: number;
  activeEmployees: number;
  lastPayrollRunDate: string | null;
  lastPayrollGross: number | null;
  nextPayrollDate: string | null;
}

function assertMock(action: string) {
  if (providers.payroll === 'live') {
    throw new Error(
      `PAYROLL_PROVIDER=live is set, but ${action} isn't wired up yet. QuickBooks Payroll is a separate ` +
        'Intuit product with its own API/scopes — implement the call in src/lib/quickbooks/payroll.ts ' +
        'once that access is provisioned.',
    );
  }
}

/**
 * QuickBooks Payroll requires its own product access beyond the standard
 * Accounting API scope, so this runs against a local employee directory by
 * default (PAYROLL_PROVIDER=mock) rather than fabricated numbers — it
 * starts empty and is genuinely yours: everything you add here is stored
 * for real (see src/lib/store/jsonStore.ts) until Payroll access is
 * provisioned and PAYROLL_PROVIDER=live is wired up.
 */
export async function listEmployees(): Promise<Employee[]> {
  assertMock('listing employees');
  return mockListEmployees();
}

export async function getEmployee(id: string): Promise<Employee | null> {
  assertMock('looking up an employee');
  return mockGetEmployee(id);
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  assertMock('adding an employee');
  return mockCreateEmployee(input);
}

export async function setEmployeeBasePay(id: string, basePay: BasePay): Promise<Employee> {
  assertMock("setting an employee's base pay");
  return mockSetBasePay(id, basePay);
}

export async function getPayrollSummary(): Promise<PayrollSummary> {
  assertMock('reading the payroll summary');
  return mockGetPayrollSummary();
}
