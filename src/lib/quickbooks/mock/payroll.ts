import { readJsonFile, writeJsonFile } from '@/lib/store/jsonStore';
import type { Employee, CreateEmployeeInput, PayrollSummary } from '@/lib/quickbooks/payroll';

const FILE_NAME = 'payroll-employees.json';

const SEED_EMPLOYEES: Employee[] = [
  {
    id: 'emp_1',
    displayName: 'Jordan Alvarez',
    email: 'jordan.alvarez@example.com',
    jobTitle: 'Store Manager',
    department: 'Retail',
    hiredDate: '2021-03-15',
    status: 'active',
    basePay: { amount: 68000, period: 'salary-annual' },
  },
  {
    id: 'emp_2',
    displayName: 'Priya Nair',
    email: 'priya.nair@example.com',
    jobTitle: 'Repair Technician',
    department: 'Service',
    hiredDate: '2022-07-01',
    status: 'active',
    basePay: { amount: 28.5, period: 'hourly' },
  },
  {
    id: 'emp_3',
    displayName: 'Marcus Webb',
    email: 'marcus.webb@example.com',
    jobTitle: 'Sales Associate',
    department: 'Retail',
    hiredDate: '2024-01-10',
    status: 'active',
    basePay: { amount: 19.0, period: 'hourly' },
  },
  {
    id: 'emp_4',
    displayName: 'Dana Kim',
    email: 'dana.kim@example.com',
    jobTitle: 'Bookkeeper',
    department: 'Admin',
    hiredDate: '2020-11-02',
    status: 'terminated',
    basePay: { amount: 52000, period: 'salary-annual' },
  },
];

async function loadAll(): Promise<Employee[]> {
  return readJsonFile<Employee[]>(FILE_NAME, SEED_EMPLOYEES);
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

export async function mockGetPayrollSummary(): Promise<PayrollSummary> {
  const employees = await loadAll();
  const active = employees.filter((e) => e.status === 'active');
  return {
    totalEmployees: employees.length,
    activeEmployees: active.length,
    lastPayrollRunDate: '2026-09-15',
    lastPayrollGross: 24680,
    nextPayrollDate: '2026-09-30',
  };
}
