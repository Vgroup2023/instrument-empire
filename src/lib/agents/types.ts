import type { HtsIndex } from '@/lib/hts';
import type { HtsSuggestion } from '@/lib/hts/classify';
import type { ScreeningIndex } from '@/lib/screening/match';

// Pure types for the six trade agents. Each agent is a
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
  /** Cached HTS suggestion for this description, and the key it was made under. */
  htsSuggestion?: HtsSuggestion | null;
  htsSuggestionKey?: string | null;
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
  carrier: string | null;
  containerNo: string | null;
  lastFreeDate: string | null;
  deliveredAt: string | null;
  /** Total on the latest commercial invoice read by DocuPilot (USD or unstated currency). */
  invoiceTotal?: number | null;
  events: { type: string; occurredAt: string }[];
  warehouse: WarehouseCtx | null;
  lines: ShipmentLineCtx[];
}

export interface WarehouseCtx {
  binLocation: string | null;
  expectedPieces: number | null;
  receivedPieces: number | null;
  damagedPieces: number;
  receivedAt: string | null;
  releasedAt: string | null;
  freeDays: number;
  dailyRate: number | null;
  storageBilledAt: string | null;
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
  /** The official tariff and screening list, when they have been synced. */
  hts?: HtsIndex | null;
  screening?: ScreeningIndex | null;
  invoices: InvoiceCtx[];
  bills: BillCtx[];
}

export type DeskAgentId = 'order-intake' | 'customer-service' | 'order-processing' | 'shipping-processing';
export type FindingAgent = AgentId | DeskAgentId;

export const DESK_AGENTS: { id: DeskAgentId; name: string; summary: string }[] = [
  { id: 'order-intake', name: 'Order Intake', summary: 'Reads incoming orders, checks them and confirms the clean ones.' },
  { id: 'customer-service', name: 'Customer Service', summary: 'Answers order questions from the order record and escalates the rest.' },
  { id: 'order-processing', name: 'Order Processing', summary: 'Checks credit and stock, then reserves stock for confirmed orders.' },
  { id: 'shipping-processing', name: 'Shipping Processing', summary: 'Picks the shipping method and ship-by date, and watches late and in-transit orders.' },
];

export interface Finding {
  agent: FindingAgent;
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

export type Department = 'customs' | 'compliance' | 'shipping' | 'logistics' | 'warehouse' | 'accounts' | 'service';

export const DEPARTMENTS: { id: Department; name: string }[] = [
  { id: 'customs', name: 'Customs brokerage' },
  { id: 'compliance', name: 'Trade compliance' },
  { id: 'shipping', name: 'Shipping & documentation' },
  { id: 'logistics', name: 'Logistics & transport' },
  { id: 'warehouse', name: 'Warehouse' },
  { id: 'accounts', name: 'Accounts' },
  { id: 'service', name: 'Customer service' },
];

/** Which team owns a finding, from the first part(s) of its dedupe key. */
export function departmentFor(dedupeKey: string): Department {
  const [a, b] = dedupeKey.split(':');
  if (a === 'desk') return 'service';
  if (a === 'bill') return 'accounts';
  if (a === 'screen' || a === 'embargo' || a === 'eccn' || a === 'eei') return 'compliance';
  if (a === 'docs') return 'shipping';
  if (a === 'risk' && (b === 'lfd' || b === 'late')) return 'logistics';
  if (a === 'risk' && b === 'wh') return 'warehouse';
  if (a === 'risk') return 'compliance';
  return 'customs';
}

export type Stage = 'booked' | 'in_transit' | 'arrived' | 'cleared' | 'in_warehouse' | 'delivered' | 'invoiced' | 'cancelled';

export const STAGES: { id: Stage; name: string }[] = [
  { id: 'booked', name: 'Booked' },
  { id: 'in_transit', name: 'In transit' },
  { id: 'arrived', name: 'Arrived' },
  { id: 'cleared', name: 'Customs cleared' },
  { id: 'in_warehouse', name: 'In warehouse' },
  { id: 'delivered', name: 'Delivered' },
  { id: 'invoiced', name: 'Invoiced' },
];

/** The furthest point the shipment has reached, judged from filings, events and warehouse status. */
export function stageOf(s: ShipmentCtx, now: Date): Stage {
  if (s.status === 'cancelled') return 'cancelled';
  if (s.invoicedAt) return 'invoiced';
  if (s.deliveredAt || s.events.some((e) => e.type === 'delivered')) return 'delivered';
  const w = s.warehouse;
  if (w?.receivedAt && !w.releasedAt) return 'in_warehouse';
  if (s.events.some((e) => e.type === 'customs_released' || e.type === 'gate_out')) return 'cleared';
  if (s.events.some((e) => e.type === 'arrived') || (s.arrivalDate !== null && dayStart(s.arrivalDate) <= now)) return 'arrived';
  if (s.events.some((e) => e.type === 'departed') || (s.loadingDate !== null && dayStart(s.loadingDate) <= now)) return 'in_transit';
  return 'booked';
}

export const EVENT_TYPES = [
  { id: 'booked', label: 'Booked' },
  { id: 'departed', label: 'Departed origin' },
  { id: 'arrived', label: 'Arrived at port' },
  { id: 'customs_hold', label: 'Customs hold' },
  { id: 'customs_released', label: 'Customs released' },
  { id: 'gate_out', label: 'Gate out / picked up' },
  { id: 'warehouse_received', label: 'Received at warehouse' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'note', label: 'Note' },
] as const;

