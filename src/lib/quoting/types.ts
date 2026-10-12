// Plain shapes shared by the quoting engine, its API routes and its screens.

export interface QuoteSettings {
  targetMarginPct: number;
  overheadPct: number;
  scrapPct: number;
  priceStaleDays: number;
  minLeadDays: number;
  quoteValidDays: number;
  certifications: string[];
}

export interface MaterialPrice {
  id: string;
  material: string;
  vendor: string;
  price: number;
  unit: string;
  priceDate: string;
}

export interface RoutingRule {
  id: string;
  operation: string;
  keywords: string[];
  setupHours: number;
  runMinutes: number;
  ratePerHour: number;
}

export interface PriorJob {
  id: string;
  partNumber: string | null;
  description: string;
  customerName: string | null;
  material: string | null;
  operations: string[];
  qty: number;
  laborHoursPerPart: number | null;
  materialCostPerPart: number | null;
  unitPrice: number | null;
  completedOn: string | null;
}

export interface PartInput {
  partNumber?: string | null;
  description: string;
  material?: string | null;
  qty: number;
  operations: string[];
  /** Finished weight per part, in pounds. */
  weightLb?: number | null;
  finish?: string | null;
  notes?: string | null;
  /** Set when the weight was worked out from stock dimensions rather than stated. */
  weightEstimated?: boolean;
}

export type Severity = 'high' | 'medium' | 'low';

export interface Flag {
  code: string;
  severity: Severity;
  message: string;
  /** Line number of the part this is about; absent for the whole RFQ. */
  line?: number;
}

export interface PriorMatch {
  id: string;
  partNumber: string | null;
  description: string;
  qty: number;
  unitPrice: number | null;
  laborHoursPerPart: number | null;
  completedOn: string | null;
  similarity: number;
  matchedBy: 'part-number' | 'description';
}

export interface PartCosting {
  material: {
    canonical: string | null;
    vendor?: string;
    pricePerLb?: number;
    priceDate?: string;
    ageDays?: number;
    weightLb?: number;
    costPerPart: number | null;
    source: 'price-list' | 'prior-job' | 'none';
  };
  operations: { operation: string; found: boolean; setupHours: number; runMinutes: number; ratePerHour: number; costPerPart: number }[];
  laborCostPerPart: number;
  materialCostPerPart: number;
  overheadCostPerPart: number;
  priorJobs: PriorMatch[];
  avgPriorUnitPrice: number | null;
  unitCost: number;
  unitPrice: number;
  confidence: 'high' | 'medium' | 'low';
  /** Plain-language lines saying where each number came from. */
  basis: string[];
}

export interface CostedPart extends PartInput {
  line: number;
  costing: PartCosting;
}

export interface QuoteContext {
  settings: QuoteSettings;
  prices: MaterialPrice[];
  routing: RoutingRule[];
  priorJobs: PriorJob[];
  /** Today, as YYYY-MM-DD. Passed in so tests are repeatable. */
  today: string;
}

export interface RfqCosted {
  parts: CostedPart[];
  flags: Flag[];
  costTotal: number;
  priceTotal: number;
  marginPct: number;
}
