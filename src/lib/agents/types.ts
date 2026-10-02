// Pure, dependency-free types for the six trade agents. Each agent is a
// function from a snapshot of the data (AgentContext) to findings, so the
// rules can be tested without a database; runner.ts does the loading/saving.

export type AgentId =
  | 'hts-oracle'
  | 'cbp-sentinel'
  | 'export-shield'
  | 'docupilot'
  | 'risk-radar'
  | 'billbot';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface AgentMeta {
  id: AgentId;
  name: string;
  summary: string;
}

export const AGENTS: AgentMeta[] = [
  { id: 'hts-oracle', name: 'HTS Oracle', summary: 'Checks tariff codes and suggests starting points for unclassified lines.' },
  { id: 'cbp-sentinel', name: 'CBP Sentinel', summary: 'Watches ISF and entry filing deadlines.' },
  { id: 'export-shield', name: 'Export Shield', summary: 'Screens parties and destinations and checks EEI timing.' },
  { id: 'docupilot', name: 'DocuPilot', summary: 'Checks each file has its documents and consistent values.' },
  { id: 'risk-radar', name: 'Risk Radar', summary: 'Scores each file by the open issues the other agents found.' },
  { id: 'billbot', name: 'BillBot', summary: 'Flags overdue invoices, unbilled files, bills due and the CBP statement date.' },
];

export interface ShipmentLineCtx {
  id: string;
  description: string;
  htsCode: string | null;
  value: number | null;
  eccn: string | null;
}

export interface ShipmentCtx {
  id: string;
  reference: string;
  direction: 'import' | 'export';
  status: 'open' | 'completed' | 'cancelled';
  originCountry: string | null;
  destinationCountry: string | null;
  shipper: string | null;
  consignee: string | null;
  loadingDate: string | null;
  arrivalDate: string | null;
  isfFiledAt: string | null;
  entryFiledAt: string | null;
  eeiFiledAt: string | null;
  invoicedAt: string | null;
  receivedDocs: string[];
  declaredValue: number | null;
  lines: ShipmentLineCtx[];
}

export interface InvoiceCtx {
  id: string;
  docNumber: string | null;
  customerName: string;
  balance: number;
  dueDate: string | null;
  lastReminderSentAt: string | null;
}

export interface BillCtx {
  id: string;
  docNumber: string | null;
  vendorName: string;
  balance: number;
  dueDate: string | null;
  approved: boolean;
}

export interface AgentContext {
  now: Date;
  shipments: ShipmentCtx[];
  restrictedParties: string[];
  invoices: InvoiceCtx[];
  bills: BillCtx[];
}

export interface Finding {
  agent: AgentId;
  severity: Severity;
  title: string;
  detail: string;
  shipmentId?: string;
  dedupeKey: string;
  action?: Record<string, string>;
}

export const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 40, high: 20, medium: 8, low: 3 };

export function dayStart(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function hoursUntil(target: Date, now: Date): number {
  return (target.getTime() - now.getTime()) / 3_600_000;
}

export function isActive(s: ShipmentCtx): boolean {
  return s.status === 'open';
}
