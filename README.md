# Accounts Copilot

A proprietary, single-tenant financial insights **and actions** app for the accounts
department. It's a Next.js 16 (App Router + TypeScript + Tailwind) app with no external
UI/chart libraries — everything is hand-rolled so the dependency footprint stays tiny and
auditable. This is not a product for resale or multi-customer use — it's meant to be run by
one business, for that business's own books.

**Standalone by default, QuickBooks optional.** This app owns its own database (Postgres —
see `src/db/schema.ts`) and is fully usable on its own, with no QuickBooks account required.
QuickBooks integration (`src/lib/quickbooks/*`) remains available as a separate, optional
connection in Settings for the features that still use it, and is being progressively phased
out as more of the app moves onto the local database — see **What's on the local database vs.
still QuickBooks-backed** below for the current split.

## Before you rely on this for real, daily bookkeeping

- **Everything under Accounting, Payables, Actions, and Banking works immediately** — no
  QuickBooks connection needed, since it all runs on this app's own database now (Chart of
  accounts, Journal entries, Customers, Vendors, Products & services, Invoices, Estimates,
  Bills, Expenses, and Transfers). **Connect your real QuickBooks company** (Settings &
  connection) to use Insights, Payroll, Payment links, Capital, and recurring schedules —
  until then, those screens show an explicit "not connected" state rather than fabricated
  numbers.
- **Set real `SMTP_*` env vars to actually email invoices, estimates, and reminders** — see
  **Environment variables** below. Without them, clicking Send/Remind fails with a clear
  "email isn't configured" error rather than silently doing nothing.
- **Payment links, Payroll, and QuickBooks Capital start empty and stay demo-mode**
  (`PAYMENTS_PROVIDER`, `PAYROLL_PROVIDER`, `CAPITAL_PROVIDER` in `.env`) until you have
  the corresponding Intuit product access and wire it up — see **What's live vs. demo
  data** below. Payment links created in demo mode are clearly flagged everywhere and
  cannot actually be emailed to a customer or process a payment.
- **Set a real `APP_PASSWORD` and `SESSION_SECRET`** — not the placeholder values from
  `.env.example`. The login route now rate-limits repeated failed attempts, but the
  passphrase is still the only thing standing between the internet and your financials.
- **Pick hosting with a persistent filesystem** (a small VM, Docker container, Railway,
  Render, Fly.io, or your own machine) if you want recurring schedules, payment links, or
  payroll edits to actually stick — see the **Deploying to Netlify** filesystem caveat
  below. Everything backed by QuickBooks or this app's own database is unaffected either way.
- **Back up the `data/` directory** if you're self-hosting — it's the only place
  recurring-schedule and payroll/payment-link records live outside of QuickBooks itself.

## What it does

**Insights**
- Profitability, cash flow, and balance sheet health (`/dashboard`), pulled from QuickBooks'
  ProfitAndLoss, CashFlow, and BalanceSheet reports.
- Industry benchmarking against similar businesses, on the same page.
- A/R and A/P aging (`/dashboard/ar-ap`) — who owes you money, and which bills are due.
- Sales breakdown by customer and by product/service (`/dashboard/sales`).

**Actions**
- Invoices and estimates (`/dashboard/invoices`, `/dashboard/estimates`): runs on this app's
  own database — create, edit, duplicate, delete, and email, plus scheduling them to recur
  (weekly/monthly/quarterly/yearly, still created through QuickBooks until recurring schedules
  are migrated too — see the table below). Sending or reminding emails the customer for real
  via the SMTP server you configure (see **Environment variables**), not through QuickBooks.
  Invoice payments (`/dashboard/invoices` → Record payment) track what's actually been paid
  against an invoice — this app's own replacement for the balance QuickBooks used to compute
  for us — and post into a bank account from your Chart of Accounts.
- Customers and products/services (`/dashboard/customers`, `/dashboard/products`): runs on
  this app's own database — add, edit, and deactivate/reactivate. There's no hard-delete, so
  deactivating is the real "delete" here — same pattern as the Chart of Accounts. A
  deactivated one drops out of the picker on new invoices/estimates, but stays visible (and
  editable/reactivatable) on its own management page and on any older document that already
  references it.
- Payment links and payment reminders (`/dashboard/payments`): create a link, edit it while
  it's still unsent, email it, cancel it, or nudge a customer with an overdue balance.
- **Every outbound action — sending an invoice/estimate, a reminder, or a payment
  link — goes through a preview-and-confirm dialog first.** Nothing is emailed without an
  explicit click on the exact content that will go out.

**Payables** — runs on this app's own database, no QuickBooks connection required:
- Vendors (`/dashboard/vendors`): the Accounts Payable counterpart to Customers. Add, edit,
  and deactivate/reactivate; no hard-delete, same as Customers and the Chart of Accounts.
- Bills (`/dashboard/bills`): record a bill against an expense/COGS category from your Chart
  of Accounts, edit, duplicate, or delete it (blocked while a payment is recorded against it,
  same protection QuickBooks provided), and pay one from a real bank account — also from your
  Chart of Accounts. Balance is computed live from recorded payments, same pattern as invoice
  payments.

**Accounting** — runs on this app's own database, no QuickBooks connection required:
- Chart of accounts (`/dashboard/accounts`): every account in your books — add a new one
  (bank, income, expense, and everything between), edit its name/number/description, and
  deactivate or reactivate one. Type/category can't be changed after creation (same rule
  QuickBooks itself follows), so deactivating is the real "delete" here. Each account's
  balance is computed live from its posted journal-entry lines.
- Journal entries (`/dashboard/journal-entries`): manual double-entry adjustments — accruals,
  corrections, depreciation, and the like. The line editor shows a running debit/credit total
  and won't let you save an out-of-balance entry.

**Banking** — runs on this app's own database, no QuickBooks connection required:
- Expenses (`/dashboard/expenses`): money paid immediately — by card, cash, or check — as
  opposed to a bill owed for later. Categorize each line to an expense/COGS account from your
  Chart of Accounts, same picker as bills. Create, edit, or delete any expense.
- Transfers (`/dashboard/transfers`): move money between your own bank/credit card accounts.
  Create, edit, or delete a transfer.
- There's no bank-reconciliation workflow here — this app records the transactions, but
  actually reconciling against a bank statement isn't built (QuickBooks' own reconcile screen
  was never exposed through its public API either, so this isn't a regression from connecting
  it).

**People & money**
- Payroll (`/dashboard/payroll`): read-only answers (headcount, last/next payroll run),
  an employee directory with hire/employment status, and the ability to add an employee, edit
  their profile (name, job title, department, email), set base pay, and terminate/reactivate them.
- QuickBooks Capital (`/dashboard/capital`): your loans and how your borrowing terms compare
  to peer businesses (read-only, as requested).

**Multi-currency** was only relevant while your QuickBooks company had it enabled. Now that
Customers, Vendors, Invoices, Estimates, and Bills all run on this app's own database, the
currency picker is gone for the moment — everything local defaults to USD. Multi-currency
support would need to be rebuilt as a local feature (its own settings, per-customer/vendor
currency, exchange rates) rather than borrowed from QuickBooks — not planned yet.

**Bank connections** live inside QuickBooks Online itself — once you connect your company
(below), any bank feeds you've linked in QuickBooks show up automatically in the Banking
center there, and their effects flow into the reports this app reads (cash flow, balance
sheet, etc). There's no separate bank-linking step in this app.

## What's on the local database vs. still QuickBooks-backed

This app is migrating, feature by feature, from QuickBooks-backed to fully standalone on its
own Postgres database (see `src/db/schema.ts` for the full schema). Currently:

| Area | Backed by |
|---|---|
| Chart of accounts, Journal entries, Customers, Vendors, Products & services, Invoices, Estimates, Bills, Expenses, Transfers | This app's own database — no QuickBooks connection needed |
| Everything else (Insights, Payroll, Payment links, Capital, recurring schedules) | Still QuickBooks-backed for now — being migrated in upcoming phases |

## What's live vs. demo data (for QuickBooks-backed features)

Everything under **Insights** and **recurring schedules** (which still create their invoices/
estimates through QuickBooks even though the Invoices/Estimates tabs themselves no longer need
it — see the note below) runs against your real QuickBooks Online company through the public
Accounting API once you connect it. **Accounting**, **Payables**, **Actions** (Invoices and
Estimates), and **Banking** (Expenses and Transfers) no longer depend on QuickBooks at all —
see the table above.

**Recurring schedules caveat:** a recurring invoice/estimate schedule still creates its
documents through the QuickBooks Accounting API (`src/lib/quickbooks/recurring.ts`), so a
document created automatically by a schedule shows up in QuickBooks, not in this app's own
Invoices/Estimates tabs, until recurring schedules are migrated too (see the phases below).
Manually created and edited invoices/estimates are unaffected — those are fully local now.

Four areas use a separate Intuit product that isn't part of the standard Accounting API scope,
so they don't have a real data source by default:

| Feature | Env var | Why | Until then |
|---|---|---|---|
| Payment links | `PAYMENTS_PROVIDER` | Standalone payment links are a QuickBooks Payments feature, not the Accounting API. | Links you create are stored locally and clearly marked as demo — sending one updates its status here but never emails anyone or moves money. |
| Payroll | `PAYROLL_PROVIDER` | QuickBooks Payroll has its own product, API, and scopes. | The employee directory starts empty and is genuinely yours (stored locally) — no fabricated employees. |
| QuickBooks Capital | `CAPITAL_PROVIDER` | Loan/lending data is a separate Intuit lending product. | The page shows "not connected" rather than invented loans. |
| Industry benchmarking | `BENCHMARK_PROVIDER` | Requires Intuit's benchmarking product for your industry code/region. | "Your" figures are computed from your real connected P&L/balance sheet; the peer-side numbers are illustrative and clearly labeled "Estimated." |

Each defaults to `mock`. The UI and confirm-before-send flow are fully functional either way —
only the underlying data source changes, and nothing fabricated is ever presented as real.
Each corresponding module (`src/lib/quickbooks/payments.ts`, `payroll.ts`, `capital.ts`,
`benchmark.ts`) has a single, clearly-commented spot to wire in the real Intuit API call once
that product access is provisioned; flip the env var to `live` after doing so.

Recurring invoices/estimates are also app-owned rather than a QuickBooks feature: the public
Accounting API has no endpoint for creating recurring transaction templates. This app stores
schedules itself (`src/lib/quickbooks/recurring.ts`) and creates/sends the actual invoice or
estimate through the real QuickBooks API when a schedule comes due. See **Recurring schedules**
below for how to run that on a timer.

## Setup

### 1. Create an Intuit developer app

1. Go to <https://developer.intuit.com/app/developer/myapps> and create an app with
   **QuickBooks Online and Payments** access.
2. Under the app's *Keys & OAuth* tab, copy the **Client ID** and **Client Secret** (use the
   sandbox keys while testing, production keys when you're ready to connect your real books).
3. Add a Redirect URI that matches `QBO_REDIRECT_URI` below exactly, e.g.
   `http://localhost:3000/api/auth/callback` for local dev, or your deployed
   `https://your-app.example.com/api/auth/callback` in production.

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill it in:

```
DATABASE_URL=            # Postgres connection string (Supabase, Neon, etc.) — required
APP_PASSWORD=            # shared passphrase that gates this internal tool
SESSION_SECRET=          # long random string (openssl rand -hex 32)
APP_BASE_URL=            # e.g. http://localhost:3000
QBO_CLIENT_ID=           # optional — only needed for QuickBooks-backed features
QBO_CLIENT_SECRET=
QBO_ENVIRONMENT=sandbox  # or "production"
QBO_REDIRECT_URI=        # must exactly match the Intuit app's redirect URI
SMTP_HOST=               # optional — only needed to actually send invoice/estimate emails
SMTP_PORT=587            # 587 (STARTTLS) or 465 (implicit TLS) are typical
SMTP_USER=               # leave blank if your SMTP relay doesn't require auth
SMTP_PASSWORD=
SMTP_FROM=               # e.g. "Your Business <billing@yourbusiness.com>"
```

Leave `PAYMENTS_PROVIDER`, `PAYROLL_PROVIDER`, `CAPITAL_PROVIDER`, `BENCHMARK_PROVIDER` as
`mock` until you've provisioned the corresponding Intuit product. Leave the `SMTP_*` vars blank
until you have a mailbox/relay to send from — Invoices/Estimates work fine without them; only
Send/Remind need SMTP configured, and fail with a clear error otherwise.

### 3. Set up the database

Create a Postgres database (a free [Neon](https://neon.tech) or [Supabase](https://supabase.com)
project both work) and put its connection string in `DATABASE_URL`. Then run the migration to
create all the tables:

```
npm run db:migrate
```

If your hosting environment can't reach your database's port directly (some sandboxed dev
environments only allow outbound HTTPS), run the SQL in `drizzle/*.sql` directly through your
database provider's own SQL editor instead — it's the exact same migration.

### 4. Install and run

```
npm install
npm run dev
```

Open the app and sign in with `APP_PASSWORD`. Chart of accounts, Journal entries, Customers,
Vendors, Products & services, Invoices, Estimates, Bills, Expenses, and Transfers all work
immediately against your database (add `SMTP_*` env vars too if you want Send/Remind to
actually email customers). To use the QuickBooks-backed features too (Insights, Payroll,
Payment links, Capital, recurring schedules), go to **Settings & connection** and click
**Connect QuickBooks**.

## Deploying to Netlify

The repo includes a `netlify.toml` that pins the Next.js runtime plugin
(`@netlify/plugin-nextjs`, also listed in `devDependencies`), so deploying is mostly
point-and-click:

1. Push this repo to GitHub if it isn't already, then in the
   [Netlify dashboard](https://app.netlify.com) choose **Add new site → Import an existing
   project** and pick this repo. Netlify reads `netlify.toml` and auto-detects the Next.js
   runtime; no build settings need to change.
2. Before the first deploy (or right after, then redeploy), add these under **Site
   configuration → Environment variables**: `DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`,
   `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT`, `CRON_SECRET`, and optionally the
   four `*_PROVIDER` flags (they default to `mock` if omitted). `QBO_*` vars are only needed if
   you're using the QuickBooks-backed features; `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
   `SMTP_PASSWORD`, and `SMTP_FROM` are only needed to actually send invoice/estimate emails.
3. Once Netlify gives you a domain (`https://your-app.netlify.app`, or a custom one), set
   `APP_BASE_URL` to it and `QBO_REDIRECT_URI` to `https://<that domain>/api/auth/callback`
   — then add that exact same redirect URI to the Intuit app (Setup step 1), and redeploy so
   the new env vars take effect.
4. Sign in with `APP_PASSWORD` and connect QuickBooks from **Settings & connection**, same as
   local dev.

**Recurring schedules cron:** Netlify's Scheduled Functions work differently from Vercel's
`vercel.json` cron, so instead of a platform-specific cron config, point any external
scheduler (a GitHub Actions workflow on a `schedule:` trigger, cron-job.org, etc.) at
`POST https://<your domain>/api/recurring/run-due` once a day with an
`Authorization: Bearer <CRON_SECRET>` header. This is host-agnostic — it'll keep working if
you ever move hosts again.

**Filesystem caveat:** Netlify Functions don't have a persistent filesystem — each invocation
can start from a clean slate. That's fine for everything backed by QuickBooks or this app's
own database (Insights, Invoices, Estimates, Bills, Expenses, Transfers, Chart of accounts,
Journal entries, Customers, Vendors, Products & services, the login/connect flow) or by the
signed-cookie session, but the
JSON-file store behind **recurring schedules**, **demo payment links**, and
**demo payroll edits** (`src/lib/store/jsonStore.ts`) won't reliably persist there — a
schedule or employee you add may disappear on the next request. Those three features work
correctly on a host with a persistent filesystem (a small VM, Docker container, Railway,
Render, Fly.io, etc.); on Netlify, treat them as a UI preview rather than durable storage
until that store is swapped for a real database or KV service.

## Recurring schedules

`POST /api/recurring/run-due` finds every active schedule whose next run date has arrived,
creates the invoice/estimate through QuickBooks, optionally emails it, and advances the
schedule. The route (in `src/app/api/recurring/run-due/route.ts`) checks the
`Authorization: Bearer $CRON_SECRET` header, so point any external scheduler at it once a day
— a GitHub Actions workflow on a `schedule:` trigger, cron-job.org, or similar — e.g.:

```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.example.com/api/recurring/run-due
```

If `CRON_SECRET` is unset, the route accepts any caller — fine for local testing, not for
production.

## Security notes

- The whole app sits behind a single shared passphrase (`APP_PASSWORD`), checked in
  `src/proxy.ts` via a signed, httpOnly cookie — this is an internal tool for one
  business's accounts team, not a multi-tenant product.
- The login route (`src/lib/rateLimit.ts`) locks out an IP after repeated failed attempts
  within a 15-minute window. It's in-memory (resets on restart, doesn't share state across
  multiple server instances), so it's a real deterrent for the single-server deployment
  this app is meant for, not a substitute for a strong `APP_PASSWORD`.
- QuickBooks tokens are stored the same way (signed, httpOnly, `secure` in production) and
  refreshed automatically before they expire.
- `next.config.mjs` sends a Content-Security-Policy and standard hardening headers
  (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) on
  every response.
- Every action that emails something to a customer (invoice, estimate, reminder, payment
  link) requires an explicit confirmation on a dialog that shows exactly who it's going to and
  what's in it — see `src/components/ui/ConfirmSendDialog.tsx`.

## Project structure

```
src/
  app/
    dashboard/        Pages for each tab (server components; fetch data directly)
    api/               Route handlers for mutations (create/update/send/duplicate/etc.)
  components/          UI split by feature, plus a small shared kit in components/ui
  lib/
    quickbooks/        QuickBooks API client, OAuth, and one module per feature area
      mock/            Demo-data providers for Payments/Payroll/Capital/Benchmark
    store/             Tiny JSON-file store backing recurring schedules & demo data
    session.ts         Signed-cookie session (app login + QuickBooks tokens)
```
