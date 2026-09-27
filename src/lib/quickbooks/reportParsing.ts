// Generic helpers for the QuickBooks Online Reports API's nested JSON shape.
// The exact node names Intuit returns (Header / Rows / Summary / ColData)
// are stable across reports, but which "group" codes and section labels
// show up varies by report. These helpers stay defensive: they search by
// label text (case-insensitive) rather than assuming a fixed row order.

export interface QboReportColumn {
  ColTitle: string;
  ColType?: string;
}

export interface QboReportColData {
  value: string;
  id?: string;
}

export interface QboReportRow {
  Header?: { ColData: QboReportColData[] };
  Rows?: { Row: QboReportRow[] };
  Summary?: { ColData: QboReportColData[] };
  ColData?: QboReportColData[];
  type?: string;
  group?: string;
}

export interface QboReport {
  Header?: Record<string, unknown>;
  Columns?: { Column: QboReportColumn[] };
  Rows?: { Row: QboReportRow[] };
}

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value.replace(/,/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

interface FlatEntry {
  label: string;
  cols: string[];
  isSummary: boolean;
}

function walk(rows: QboReportRow[] | undefined, out: FlatEntry[]): void {
  if (!rows) return;
  for (const row of rows) {
    if (row.Rows?.Row) walk(row.Rows.Row, out);

    if (row.ColData && row.ColData.length > 0) {
      out.push({ label: row.ColData[0]?.value ?? '', cols: row.ColData.map((c) => c.value), isSummary: false });
    }
    if (row.Summary?.ColData && row.Summary.ColData.length > 0) {
      out.push({
        label: row.Summary.ColData[0]?.value ?? '',
        cols: row.Summary.ColData.map((c) => c.value),
        isSummary: true,
      });
    }
  }
}

export function flattenReportRows(report: QboReport): FlatEntry[] {
  const out: FlatEntry[] = [];
  walk(report.Rows?.Row, out);
  return out;
}

/** Finds the first row whose label matches any of the given patterns and returns its last column as a number. */
export function findTotal(report: QboReport, patterns: RegExp[]): number {
  const entries = flattenReportRows(report);
  for (const pattern of patterns) {
    const hit = entries.find((e) => pattern.test(e.label));
    if (hit) return toNumber(hit.cols[hit.cols.length - 1]);
  }
  return 0;
}

/** Returns every leaf data row (not section totals) as a plain record keyed by column title. */
export function reportRowsAsRecords(report: QboReport): Record<string, string>[] {
  const columns = report.Columns?.Column ?? [];
  const out: Record<string, string>[] = [];

  function visit(rows: QboReportRow[] | undefined) {
    if (!rows) return;
    for (const row of rows) {
      if (row.ColData && row.ColData.length > 0) {
        const label = row.ColData[0]?.value ?? '';
        if (label && !/^total/i.test(label)) {
          const record: Record<string, string> = {};
          columns.forEach((col, i) => {
            record[col.ColTitle || `col_${i}`] = row.ColData?.[i]?.value ?? '';
          });
          out.push(record);
        }
      }
      if (row.Rows?.Row) visit(row.Rows.Row);
    }
  }

  visit(report.Rows?.Row);
  return out;
}

export { toNumber };
