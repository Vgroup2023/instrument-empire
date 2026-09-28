import { readJsonFile, writeJsonFile } from '@/lib/store/jsonStore';
import type {
  Employee,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  EmploymentStatus,
  PayrollSummary,
} from '@/lib/quickbooks/payroll';

const FILE_NAME = 'payroll-employees.json';

async function loadAll(): Promise<Employee[]> {
  return readJsonFile<Employee[]>(FILE_NAME, []);
}

async function saveAll(employees: Employee[]): Promise<void> {
  await writeJsonFile(FILE_NAME, employees);
}

export async function mockListEmployees(): Promise<Employee[]> {
  const employees = await loadAll();
  return employees.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function mockGetEmployee(id: string): Promise<Employee | null> {
  const employees = await loadAll();
  return employees.find((e) => e.id === id) ?? null;
}

export async function mockCreateEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const employees = await loadAll();
  const employee: Employee = {
    id: crypto.randomUUID(),
    displayName: input.displayName,
    email: input.email,
    jobTitle: input.jobTitle,
    department: input.department,
    hiredDate: input.hiredDate,
    status: 'active',
    basePay: input.basePay,
  };
  employees.push(employee);
  await saveAll(employees);
  return employee;
}

export async function mockSetBasePay(id: string, basePay: Employee['basePay']): Promise<Employee> {
  const employees = await loadAll();
  const employee = employees.find((e) => e.id === id);
  if (!employee) throw new Error('Employee not found.');
  employee.basePay = basePay;
  await saveAll(employees);
  return employee;
}

export async function mockUpdateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  const employees = await loadAll();
  const employee = employees.find((e) => e.id === id);
  if (!employee) throw new Error('Employee not found.');
  if (input.displayName !== undefined) employee.displayName = input.displayName;
  if (input.email !== undefined) employee.email = input.email;
  if (input.jobTitle !== undefined) employee.jobTitle = input.jobTitle;
  if (input.department !== undefined) employee.department = input.department;
  await saveAll(employees);
  return employee;
}

export async function mockSetEmployeeStatus(id: string, status: EmploymentStatus): Promise<Employee> {
  const employees = await loadAll();
  const employee = employees.find((e) => e.id === id);
  if (!employee) throw new Error('Employee not found.');
  employee.status = status;
  await saveAll(employees);
  return employee;
}

export async function mockGetPayrollSummary(): Promise<PayrollSummary> {
  const employees = await loadAll();
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
