function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type PeriodKey = 'this-month' | 'this-quarter' | 'this-year' | 'last-12-months';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export function resolvePeriod(period: PeriodKey = 'this-year'): DateRange {
  const now = new Date();
  const end = toISODate(now);

  switch (period) {
    case 'this-month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: toISODate(start), endDate: end };
    }
    case 'this-quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterStartMonth, 1);
      return { startDate: toISODate(start), endDate: end };
    }
    case 'last-12-months': {
      const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return { startDate: toISODate(start), endDate: end };
    }
    case 'this-year':
    default: {
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: toISODate(start), endDate: end };
    }
  }
}
