// Pure, dependency-free reminder-suggestion logic — kept out of invoices.ts
// deliberately so client components (like InvoicesPageClient) can import it
// without pulling in the server-only Postgres driver invoices.ts depends on.
//
// A lightweight, no-credentials-needed heuristic for when a reminder is worth
// sending, based on how overdue an invoice is and how recently one was
// already sent. This only ever suggests; sending still goes through the
// existing preview-and-confirm dialog, never automatically.

export type ReminderTone = 'neutral' | 'warning' | 'danger';

export interface ReminderSuggestion {
  /** True if sending a reminder now is worth surfacing; false just shows informational text (e.g. "Reminded 2d ago"). */
  recommended: boolean;
  tone: ReminderTone;
  label: string;
}

export interface ReminderSuggestionInput {
  Balance: number;
  DueDate?: string;
  LastReminderSentAt?: string;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

/** Returns null when there's nothing worth showing — paid, not yet due, or no due date to measure against. */
export function suggestReminderAction(invoice: ReminderSuggestionInput): ReminderSuggestion | null {
  if (invoice.Balance <= 0 || !invoice.DueDate) return null;
  const today = new Date();
  const daysOverdue = daysBetween(new Date(`${invoice.DueDate}T00:00:00Z`), today);
  if (daysOverdue < 0) return null;

  const daysSinceReminder = invoice.LastReminderSentAt ? daysBetween(new Date(invoice.LastReminderSentAt), today) : null;

  let tone: ReminderTone;
  let suppressBelowDays: number;
  let urgentLabel: string;
  if (daysOverdue <= 6) {
    tone = 'neutral';
    suppressBelowDays = 3;
    urgentLabel = `Reminder recommended — ${daysOverdue}d overdue`;
  } else if (daysOverdue <= 29) {
    tone = 'warning';
    suppressBelowDays = 7;
    urgentLabel = `Follow-up recommended — ${daysOverdue}d overdue`;
  } else {
    tone = 'danger';
    suppressBelowDays = 14;
    urgentLabel = `Significantly overdue (${daysOverdue}d) — consider escalating`;
  }

  if (daysSinceReminder !== null && daysSinceReminder < suppressBelowDays) {
    return { recommended: false, tone: 'neutral', label: `Reminded ${daysSinceReminder}d ago` };
  }
  return { recommended: true, tone, label: urgentLabel };
}
