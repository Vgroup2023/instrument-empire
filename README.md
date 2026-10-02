# Accounts Copilot

A proprietary, single-tenant financial insights **and actions** app for the accounts
department. It's a Next.js 16 (App Router + TypeScript + Tailwind) app with no external
UI/chart libraries — everything is hand-rolled so the dependency footprint stays tiny and
auditable. This is not a product for resale or multi-customer use — it's meant to be run by
one business, for that business's own books.

**Standalone by default, QuickBooks fully optional.** This app owns its own database (Postgres
— see `src/db/schema.ts`) and every feature runs on it. No QuickBooks account is required for
anything currently built, and connecting one in Settings doesn't unlock anything either — see
**What's on the local database vs. still QuickBooks-backed** below for the full picture.

## Before you rely on this for real, daily bookkeeping

- **Everything works immediately, no QuickBooks connection needed** — Chart of accounts,
  Journal entries, Customers, Vendors, Products & services, Invoices, Estimates, Bills,
  Expenses, Transfers, Payroll, Payment links, recurring schedules, and now **Insights**
  (`/dashboard`, `/dashboard/ar-ap`, `/dashboard/sales`) all run on this app's own database.
  P&L, cash flow, balance sheet, A/R & A/P aging, and sales breakdown are all computed directly
  from your local ledger — no QuickBooks account required for anything in this app anymore.
  QuickBooks remains available as a separate, optional connection in Settings, but connecting
  it doesn't currently do anything by itself — QuickBooks Payments/Payroll/Capital/benchmarking
  would each additionally need real product access *and* their live API call implemented (see
  **What's live vs. demo data** below).
- **Set real `SMTP_*` env vars to actually email invoices, estimates, and reminders** — see
  **Environment variables** below. Without them, clicking Send/Remind fails with a clear
  "email isn't configured" error rather than silently doing nothing.
- **Payment links and Payroll default to demo/local mode** (`PAYMENTS_PROVIDER`,
  `PAYROLL_PROVIDER` in `.env`) until you have real QuickBooks Payments/Payroll product access
  and wire it up — see **What's live vs. demo data** below. This only affects whether a
  payment link can really be emailed/paid; everything you create either way is stored for
  real in this app's database. QuickBooks Capital and industry benchmarking (`CAPITAL_PROVIDER`,
  `BENCHMARK_PROVIDER`) work the same way.
- **Set a real `APP_PASSWORD` and `SESSION_SECRET`** — not the placeholder values from
  `.env.example`. The login route now rate-limits repeated failed attempts, but the
  passphrase is still the only thing standing between the internet and your financials.

## What it does

**Insights** — runs on this app's own database, no QuickBooks connection required:
- Profitability, cash flow, and balance sheet health (`/dashboard`), computed directly from
  your local ledger (`src/lib/accounting/reports.ts`) — every invoice, bill, expense, transfer,
  and payment you've recorded, folded into account balances by `src/lib/accounting/chartOfAccounts.ts`.
- Industry benchmarking against similar businesses, on the same page (still illustrative —
  see **What's live vs. demo data** below).
- A/R and A/P aging (`/dashboard/ar-ap`) — who owes you money, and which bills are due, bucketed
  by days overdue against each invoice/bill's due date.
- Sales breakdown by customer and by product/service (`/dashboard/sales`), from invoices dated
  within the selected period.
- Anomaly detection (`/dashboard/anomalies`, `src/lib/accounting/anomalies.ts`) — flags
  unbalanced journal entries, possible duplicate invoices/bills/expenses (same party, same
  amount, dated within a few days of each other), unusually large or small amounts compared to
  a vendor/customer's own history, and weekend-dated entries. This is computed live from
  statistics over your own ledger each time you load the page (per-party averages, balance
  checks) rather than a trained machine-learning model, so it always reflects the latest
  activity with no separate training step, no model-hosting infrastructure, and no extra
  credentials or ongoing API cost. A genuine ML-based version — one that trains on corrections
  you make and improves its own accuracy over time — would need real training data, a model
  registry, and ongoing retraining infrastructure; this is the practical alternative that ships
  today and gets more useful simply as your ledger grows.
- Flux analysis (`/dashboard/flux-analysis`, `src/lib/accounting/fluxAnalysis.ts`) — period-over-
  period variance, account by account: this month to date against the full prior calendar month,
  sorted by the largest dollar swing. Purely quantitative — no written narrative commentary
  (that would need an LLM call, which needs an Anthropic API key this app doesn't have
  configured) and no connection to a third-party close-automation tool like Numeric.

**Actions**
- Invoices and estimates (`/dashboard/invoices`, `/dashboard/estimates`): runs on this app's
  own database — create, edit, duplicate, delete, and email, plus scheduling them to recur
  (weekly/monthly/quarterly/yearly — a schedule's documents land in these same tabs, since
  recurring schedules run on this app's own database too). Sending or reminding emails the
  customer for real via the SMTP server you configure (see **Environment variables**), not
  through QuickBooks. Invoice payments (`/dashboard/invoices` → Record payment) track what's
  actually been paid against an invoice — this app's own replacement for the balance
  QuickBooks used to compute for us — and post into a bank account from your Chart of
  Accounts.
- **Smart reminder suggestions** — each unpaid invoice shows a suggestion (not an automatic
  send) for whether a reminder is worth sending right now, based on how overdue it is and when
  one was last sent (`suggestReminderAction()` in `src/lib/accounting/reminderSuggestions.ts`):
  a gentle nudge in the first week overdue, a follow-up suggestion after that, and an escalation
  flag past 30 days — suppressed for a while right after a reminder actually goes out, so it
  doesn't nag every time you look at the page. Sending itself is unchanged: still the same
  preview-and-confirm dialog, never automatic.
- **Milestone/progress invoicing** (`/dashboard/invoices` → + Milestone plan) — split one
  contract into several invoices by percentage (e.g. a 50% deposit and 50% on completion),
  created together and linked by a shared group id (`createMilestoneInvoicePlan()` in
  `src/lib/accounting/invoices.ts`). Each milestone becomes an ordinary invoice afterward — edit,
  send, remind, and record payment on it exactly like any other; the Invoices list shows which
  milestone each one belongs to.
- Customers and products/services (`/dashboard/customers`, `/dashboard/products`): runs on
  this app's own database — add, edit, and deactivate/reactivate. There's no hard-delete, so
  deactivating is the real "delete" here — same pattern as the Chart of Accounts. A
  deactivated one drops out of the picker on new invoices/estimates, but stays visible (and
  editable/reactivatable) on its own management page and on any older document that already
  references it.
- Payment links and payment reminders (`/dashboard/payments`): runs on this app's own
  database — create a link, edit it while it's still unsent, email it, cancel it, or nudge a
  customer with an overdue balance.
- **Every outbound action — sending an invoice/estimate, a reminder, or a payment
  link — goes through a preview-and-confirm dialog first.** Nothing is emailed without an
  explicit click on the exact content that will go out.
- **Documents** — every tab above (Invoices, Estimates, Customers, Products & services,
  Payment links) has a **Documents** button per row for attaching supporting files (a signed
  contract, a receipt, a spec sheet) to that specific record. Upload, download, and delete —
  files are stored directly in this app's own database, so no separate storage service or
  extra credentials are needed. Capped at 4MB per file, meant for typical documents rather
  than large media.

**Payables** — runs on this app's own database, no QuickBooks connection required:
- Vendors (`/dashboard/vendors`): the Accounts Payable counterpart to Customers. Add, edit,
  and deactivate/reactivate; no hard-delete, same as Customers and the Chart of Accounts.
- Bills (`/dashboard/bills`): record a bill against an expense/COGS category from your Chart
  of Accounts, edit, duplicate, or delete it (blocked while a payment is recorded against it,
  same protection QuickBooks provided), and pay one from a real bank account — also from your
  Chart of Accounts. Balance is computed live from recorded payments, same pattern as invoice
  payments.
- **AP approval queue** — a bill must be **Approve**d before it can be paid, optionally with a
  planned pay date. This is a deliberate sign-off step recorded in this app's own database, not
  autonomous payment execution — there's no payment-processor connection here, so nothing ever
  moves money on its own; a person still clicks Pay when a bill is actually due. Approval can be
  revoked (back to "Pending approval") at any time before it's paid.

**Accounting** — runs on this app's own database, no QuickBooks connection required:
- Chart of accounts (`/dashboard/accounts`): every account in your books — add a new one
  (bank, income, expense, and everything between), edit its name/number/description, and
  deactivate or reactivate one. Type/category can't be changed after creation (same rule
  QuickBooks itself follows), so deactivating is the real "delete" here. Each account's
  balance is computed live from everything posted to it — journal entries, invoices, bills,
  expenses, transfers, and payments (`src/lib/accounting/chartOfAccounts.ts`).
- Journal entries (`/dashboard/journal-entries`): manual double-entry adjustments — accruals,
  corrections, depreciation, and the like. The line editor shows a running debit/credit total
  and won't let you save an out-of-balance entry.
- **Audit log** (`/dashboard/audit-log`) — a change-history trail: every journal entry and
  chart-of-accounts create/edit/delete is recorded with a before/after snapshot and a timestamp
  (`src/lib/accounting/auditLog.ts`). This app has a single shared login rather than individual
  user accounts, so entries record *what* changed and *when*, not *who* — real value for
  reviewing what happened to the ledger before period close, without overclaiming attribution
  the app has no way to track. Extending this same pattern to other entities (bills, invoices,
  expenses) is straightforward but not done yet.

**Banking** — runs on this app's own database, no QuickBooks connection required:
- Expenses (`/dashboard/expenses`): money paid immediately — by card, cash, or check — as
  opposed to a bill owed for later. Categorize each line to an expense/COGS account from your
  Chart of Accounts, same picker as bills. Create, edit, or delete any expense.
- **Category suggestions** — pick a vendor on a new expense and, if you've categorized past
  expenses from them before, the form suggests the account used most often (with how many times,
  so it's not a black box) and a one-click **Apply** button to fill it in
  (`suggestExpenseAccountsForVendor()` in `src/lib/accounting/expenses.ts`). This is a frequency
  count over this app's own data, not a connection to Expensify/Ramp or a trained classifier —
  it needs no extra credentials, and it gets more useful simply as more expenses get recorded.
- Transfers (`/dashboard/transfers`): move money between your own bank/credit card accounts.
  Create, edit, or delete a transfer.
- **Reconciliation** (`/dashboard/reconciliation`, `src/lib/accounting/reconciliation.ts`) —
  upload a bank/credit card statement (CSV export) and match it against the invoice payments,
  bill payments, expenses, and transfers already recorded against that account. This app has no
  live bank feed, so a statement export is the way in; matching is a straightforward amount +
  nearby-date heuristic, not an AI model, and nothing is saved — each upload is a one-time
  comparison rather than a persisted reconciliation session.

**People & money**
- Payroll (`/dashboard/payroll`): runs on this app's own database — read-only answers
  (headcount, last/next payroll run), an employee directory with hire/employment status, and
  the ability to add an employee, edit their profile (name, job title, department, email), set
  base pay, and terminate/reactivate them.
- QuickBooks Capital (`/dashboard/capital`): your loans and how your borrowing terms compare
  to peer businesses (read-only, as requested). QuickBooks Capital is a separate Intuit
  lending product this app doesn't have access to, so this stays empty rather than inventing
  loans — see the table further down.

**Multi-currency** was only relevant while your QuickBooks company had it enabled. Now that
Customers, Vendors, Invoices, Estimates, and Bills all run on this app's own database, the
currency picker is gone for the moment — everything local defaults to USD. Multi-currency
support would need to be rebuilt as a local feature (its own settings, per-customer/vendor
currency, exchange rates) rather than borrowed from QuickBooks — not planned yet.

**Bank connections** — this app has no live bank-feed integration of its own; Bank/Credit Card
account balances come from what you record here (Expenses, Transfers, Invoice/Bill payments),
same as everything else in Insights. If your QuickBooks company has bank feeds connected, those
transactions stay inside QuickBooks and don't flow into this app automatically — record them
here directly (or via Journal entries) for them to show up in these reports.

## What's on the local database vs. still QuickBooks-backed

This app has fully migrated off QuickBooks as its data source and now runs entirely on its own
Postgres database (see `src/db/schema.ts` for the full schema):

| Area | Backed by |
|---|---|
| Chart of accounts, Journal entries, Customers, Vendors, Products & services, Invoices, Estimates, Bills, Expenses, Transfers, Payroll, Payment links, recurring schedules, Insights (P&L, cash flow, balance sheet, A/R & A/P aging, sales breakdown) | This app's own database — no QuickBooks connection needed |

QuickBooks (`src/lib/quickbooks/*`) remains available as a separate, optional connection in
Settings, but nothing in this app requires it — see **What's live vs. demo data** below for the
two features that still use a separate, unconnected Intuit product for illustrative peer data.

## What's live vs. demo data

No feature in this app depends on a QuickBooks connection anymore — see the table above.

Two areas use a separate Intuit product that isn't part of the standard Accounting API scope,
so they don't have a real data source by default:

| Feature | Env var | Why | Until then |
|---|---|---|---|
| QuickBooks Capital | `CAPITAL_PROVIDER` | Loan/lending data is a separate Intuit lending product. | The page stays empty rather than inventing loans. |
| Industry benchmarking | `BENCHMARK_PROVIDER` | Requires Intuit's benchmarking product for your industry code/region. | "Your" figures are computed from your real local P&L/balance sheet (`src/lib/accounting/reports.ts`); the peer-side numbers are illustrative and clearly labeled "Estimated." |

Each defaults to `mock`. The UI is fully functional either way — only the underlying data
source changes, and nothing fabricated is ever presented as real. Each corresponding module
(`src/lib/quickbooks/capital.ts`, `benchmark.ts`) has a single, clearly-commented spot to wire
in the real Intuit API call once that product access is provisioned; flip the env var to
`live` after doing so.

Payment links (`PAYMENTS_PROVIDER`) and Payroll (`PAYROLL_PROVIDER`) use the same `mock`/`live`
pattern, but "mock" here means something better than a placeholder: everything you create is
stored for real in this app's own database (`src/lib/accounting/paymentLinks.ts` and
`payroll.ts`) — it just isn't backed by a real QuickBooks Payments/Payroll integration yet.
Sending a payment link in this mode updates its status here but doesn't email anyone or move
money, and is clearly flagged as demo in the UI.

Recurring invoices/estimates are also app-owned rather than a QuickBooks feature: the public
Accounting API has no endpoint for creating recurring transaction templates. This app stores
schedules and creates/sends the actual invoice or estimate itself
(`src/lib/accounting/recurring.ts`) when a schedule comes due — through the same local
Invoices/Estimates ledger a manually-created document uses. See **Recurring schedules** below
for how to run that on a timer.

## Setup

### 1. Create an Intuit developer app (optional — skip to step 2 if you don't need QuickBooks)

This step is only needed if you plan to use the optional **Connect QuickBooks** button in
Settings, which doesn't unlock anything in this app today (see **What's live vs. demo data**)
— most setups can skip straight to step 2.

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
QBO_CLIENT_ID=           # entirely optional — nothing currently built requires this
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

Open the app and sign in with `APP_PASSWORD`. Everything — Chart of accounts, Journal entries,
Customers, Vendors, Products & services, Invoices, Estimates, Bills, Expenses, Transfers,
Payroll, Payment links, recurring schedules, and Insights — works immediately against your
database (add `SMTP_*` env vars too if you want Send/Remind to actually email customers). There's
no need to visit **Settings & connection** at all for daily use — QuickBooks is not required for
anything currently built. Connecting it there does nothing on its own today; it would only
matter once you both have separate QuickBooks Payments/Payroll/Capital/benchmarking product
access *and* someone implements the corresponding live API call (each has a clearly-commented
spot to do so — see **What's live vs. demo data**).

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
   `CRON_SECRET`, and optionally the four `*_PROVIDER` flags (they default to `mock` if
   omitted). `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT`, and `QBO_REDIRECT_URI`
   are entirely optional — only add them if you plan to use the **Connect QuickBooks** button in
   Settings at all; `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` are
   only needed to actually send invoice/estimate emails.
3. If you did add the `QBO_*` vars, once Netlify gives you a domain
   (`https://your-app.netlify.app`, or a custom one), set `APP_BASE_URL` to it and
   `QBO_REDIRECT_URI` to `https://<that domain>/api/auth/callback` — then add that exact same
   redirect URI to the Intuit app (Setup step 1), and redeploy so the new env vars take effect.
4. Sign in with `APP_PASSWORD` — the app is fully usable from here. Connecting QuickBooks from
   **Settings & connection** is optional and not required for anything currently built (see
   **What's live vs. demo data**).

**Recurring schedules cron:** Netlify's Scheduled Functions work differently from Vercel's
`vercel.json` cron, so instead of a platform-specific cron config, point any external
scheduler (a GitHub Actions workflow on a `schedule:` trigger, cron-job.org, etc.) at
`POST https://<your domain>/api/recurring/run-due` once a day with an
`Authorization: Bearer <CRON_SECRET>` header. This is host-agnostic — it'll keep working if
you ever move hosts again.

Netlify Functions don't have a persistent filesystem, but that's no longer a concern here —
every feature in this app, including recurring schedules, payment links, and payroll, is
backed by Postgres now (see `src/db/schema.ts`), not a JSON file, so nothing depends on
filesystem state surviving between requests.

## Recurring schedules

`POST /api/recurring/run-due` finds every active schedule whose next run date has arrived,
creates the invoice/estimate in this app's own database, optionally emails it, and advances
the schedule. The route (in `src/app/api/recurring/run-due/route.ts`) checks the
`Authorization: Bearer $CRON_SECRET` header, so point any external scheduler at it once a day
— a GitHub Actions workflow on a `schedule:` trigger, cron-job.org, or similar — e.g.:

```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.example.com/api/recurring/run-due
```

If `CRON_SECRET` is unset, the route accepts any caller — fine for local testing, not for
production.

## Installing it as an app on your phone or tablet

The site is an installable PWA (`public/manifest.json`, a minimal `public/sw.js`, and
home-screen icons in `public/icons/`):

- **Android/Chrome**: open the site, then use the browser menu → "Install app" (or "Add to
  Home screen"). It launches full-screen with its own icon, no browser chrome.
- **iOS/iPadOS Safari**: open the site, tap the Share icon, then "Add to Home Screen".
- The service worker exists only to satisfy browsers' installability check — it deliberately
  caches nothing, since this app shows live financial data and a stale cached page would be
  actively wrong, not just inconvenient. There's no offline mode.
- The whole layout was also audited for phones/tablets down to a 360px-wide screen: a
  flex/grid sizing bug in the Sidebar and login logo (a fixed-position `<img>` that ignored
  its `max-width` and forced the whole page to scroll horizontally) has been fixed, and
  safe-area padding was added for notched devices when running installed full-screen.

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
    accounting/        This app's own database-backed modules — the default for most features
    quickbooks/        QuickBooks API client, OAuth, and the (optional) QuickBooks-backed
                       equivalents still used by Insights and a few feature areas
      mock/            Demo-data providers for Capital/Benchmark (no real Intuit product access)
    session.ts         Signed-cookie session (app login + QuickBooks tokens)
```

## Trade AI agents and installing the app

**Six agents** run over your shipments and accounts (`src/lib/agents/`). Each one is a plain
rules function from a data snapshot to findings, so they're deterministic and unit-testable.
By default they call no AI model and talk to no outside service; the official tariff, the
official screening list and Claude are optional additions, described under **Official data and
Claude** below. They never talk to CBP, ACE or AES.
They only read what you record in **Shipments** and the accounting ledger, and queue findings
for a person on **AI agents** (`/dashboard/agents`).

| Agent | What it checks |
| --- | --- |
| HTS Oracle | Checks each code against the real tariff when synced (exists, valid statistical suffix), suggests a line for goods with no code, and flags likely misclassification. Without the synced tariff it checks code shape and a short keyword list. A broker must confirm every code. |
| CBP Sentinel | ISF due 24 hours before loading (ocean), filed-late detection, and the 15-day entry window. |
| Export Shield | Approximate name match of shippers and consignees against the official Consolidated Screening List (when synced) and your own list, embargoed destinations (CU, IR, KP, SY), ECCN license prompts, and EEI timing above $2,500. |
| DocuPilot | Required documents on file, lines missing values, and line totals vs declared value. |
| Risk Radar | 0–100 exposure score per file from the other agents' open findings. |
| BillBot | Overdue invoice reminders, completed-but-unbilled files, bills due, and the CBP periodic monthly statement date (15th working day; weekends only, holidays can shift it). |

Findings de-duplicate by key, close themselves when the condition clears, and stay dismissed if
you dismissed them. **Run them daily:** set `CRON_SECRET` on the server and add `APP_BASE_URL` and
`CRON_SECRET` as repository secrets; `.github/workflows/agents-daily.yml` calls
`POST /api/agents/run` (and the recurring-invoice runner) each day. Run `npm run db:migrate`
to create the new tables.

**Install it:** the app is an installable PWA. Open `/install` (no sign-in needed) for the
Install button and per-device steps. The service worker caches only an offline page and icons,
never financial data.

Still not built: ACE/ABI and AES filing. That needs CBP certification or a certified filing
partner and credentials.

## Shipping, logistics and warehouse

Every department works from the same shipment record (`/dashboard/shipments/[id]`).

- **Operations board** (`/dashboard/operations`): each file by stage (Booked, In transit, Arrived,
  Customs cleared, In warehouse, Delivered, Invoiced), plus open work per department. The stage is
  worked out from filings, timeline events and warehouse status, not typed in.
- **Logistics:** carrier, container or AWB number, last free day, and a timeline of events (departed,
  arrived, customs hold, released, gate out, received at warehouse, delivered).
- **Warehouse:** one receipt per shipment with bin, expected vs received vs damaged pieces, free
  days and a daily rate. Release and storage-billed are stamped when you click them.
- **Departments:** every agent finding is routed to Customs, Compliance, Shipping, Logistics,
  Warehouse or Accounts. Filter by department on **AI agents**.

New checks that use this data: customs hold open 2+ days (CBP Sentinel), last free day approaching
or passed and warehouse shortage or damage (Risk Radar), delivered without proof of delivery
(DocuPilot), and warehouse storage past the free days that hasn't been billed (BillBot).

**Connecting carriers, a TMS or a WMS:** set `INTEGRATION_KEY`, then have the system send

```
POST /api/integrations/events
Authorization: Bearer <INTEGRATION_KEY>
{ "reference": "IMP-100", "type": "customs_hold", "location": "Long Beach", "occurredAt": "2026-10-02T14:00:00Z" }
```

`type` is one of `booked, departed, arrived, customs_hold, customs_released, gate_out,
warehouse_received, delivered, note`. `reference` must match a shipment's file reference. A
`delivered` event also stamps the delivery time. Nothing here polls carrier tracking APIs or reads
a WMS by itself; those systems have to push events, or someone has to build a connector for them.

## Customer desk: order intake, customer service, order processing, shipping

`/dashboard/orders` runs four agents (`src/lib/desk/`) that take an order from the inbox to the
carrier and answer customers on the way. Everything they do is logged under **What the agents
did**, and anything that needs judgement lands in **AI agents** (department: Customer service).

| Agent | What it does on its own | What it hands to a person |
| --- | --- | --- |
| Order Intake | Reads an order from free text or structured lines, matches items to your product list, finds the customer by email, totals it, emails a confirmation. | Unknown items, missing address, bad quantities, likely duplicates (status `needs_review`). |
| Customer Service | Classifies each message. Answers "where is my order" with real status and tracking; cancels an order that has not been picked yet; replies to strangers with a generic "send your order number" that reveals nothing. | Complaints and disputes, returns, address changes, cancels after picking, possibly lost parcels. It drafts the reply; you edit and send. |
| Order Processing | Credit check (holds an order if the customer has an invoice 60+ days overdue), stock check, reserves stock, retries held orders each run. | Held orders (credit review or backorder). |
| Shipping Processing | Picks shipping method and ship-by date, flags international orders for customs paperwork, watches late and in-transit orders. | Late orders, parcels not delivered after 7 days. |

Safety rules baked in: replies state only facts from the order record; the sender's email must
match the order's email before anything about it is shared or changed; no automatic reply to
no-reply/out-of-office/bounce mail; at most 3 automatic replies per sender per 24 hours; address
changes, refunds and returns never happen automatically; `DESK_AUTO_SEND=off` turns every reply
into a draft.

**Bringing work in:** add orders and messages in the app, or `POST /api/integrations/desk` (needs
`INTEGRATION_KEY`) from an email-to-webhook service, web form or EDI converter:

```
{ "kind": "order",    "email": "jane@x.com", "rawText": "2 x Blue widget\n\nShip to:\n123 Main St\nSpringfield, IL 62704" }
{ "kind": "order",    "email": "jane@x.com", "lines": [{ "description": "Blue widget", "quantity": 2 }], "shipTo": { "line1": "...", "city": "...", "postal": "..." } }
{ "kind": "message",  "from": "jane@x.com", "subject": "Where is my order?", "body": "..." }
{ "kind": "shipment", "orderNumber": "SO-261002-AB12", "event": "shipped", "carrier": "UPS", "trackingNo": "1Z..." }
```

Each call runs the desk straight away, so a customer gets an answer in the same request. The
hourly workflow also runs it to retry held orders and raise late-order findings.

**Optional AI:** set `ANTHROPIC_API_KEY` and the desk uses Claude (default `claude-opus-5-5`,
override with `DESK_LLM_MODEL`) to read messy orders and classify emails. The model only returns
structured fields that are validated afterwards; a complaint found by the rules is never
downgraded; bad or missing output falls back to the rules. The reply text always comes from
templates filled with order data.

**Not built:** buying shipping labels or live carrier rates, reading carrier tracking, taking
payment, or a mailbox connector. Tracking numbers are entered by staff or pushed in through the
`shipment` call above. Product matching uses your product names (every word of a product name
must appear in the order line) and stock comes from `qtyOnHand` on Inventory-type products.

## Sign-in and the master dashboard

- **Sign-in** (`/login`): one shared passphrase (`APP_PASSWORD`) for the team; there are no per-person
  accounts. Failed attempts are rate-limited, the passphrase check is constant-time, and the
  post-login redirect only accepts same-site paths. Already signed in? `/login` skips straight on.
- **Master dashboard** (`/dashboard`): a tile for every tab, grouped like the sidebar, with live
  open-work counts (orders, agent findings, shipments), an "attention" strip, and a "Sample data"
  badge on tabs still running on demo data (payments, payroll, capital). Financial insights sit below.
- **One list of tabs:** `src/components/layout/navGroups.ts` feeds the sidebar, the mobile drawer
  and the master dashboard. `npm run check:nav` (also in CI) fails if a dashboard page isn't listed
  there or a listed page doesn't exist.

## Official data and Claude

Both are optional and show their status on **AI agents** under "Official data and Claude".

**Official tariff and screening list** (no API keys; both are public downloads):
- The US tariff from the USITC (about 29,900 lines, with each line's full description and the
  general duty rate it inherits) and the trade.gov Consolidated Screening List (about 26,100
  entries across 12 lists, with aliases) are copied into your database.
- Sync them with **Sync now** on AI agents, or `npm run refdata:sync [hts|csl]` (needs `DATABASE_URL`).
  The download takes about 15 seconds, which can exceed a serverless host's request limit, so the
  repo includes `.github/workflows/refdata-sync.yml` (daily, writes straight to the database; add
  the `DATABASE_URL` repository secret). A download that comes back short is refused and the old
  copy stays.
- Export Shield then screens every shipper and consignee in memory: the same words in any order,
  ignoring "Inc/Ltd/GmbH" and similar, is a critical match; 80%+ similar is a high-severity
  "may match". One-word names only match exactly. A real hit is not proof and a clear result is not
  clearance: it is name matching, so compare addresses and countries on the official list.
- HTS Oracle then flags codes that do not exist, unrecognised statistical suffixes, and gives
  the general duty rate with each suggestion.

**Claude** (set `ANTHROPIC_API_KEY`; model `claude-opus-5-5`, override with `DESK_LLM_MODEL`; `DESK_LLM=off` disables):
- **HTS suggestions:** Claude proposes headings and tariff words, the real tariff supplies the
  candidate lines, and Claude picks one *from that list*. A pick outside the list is discarded, so
  a suggestion is always a line that exists. Each description is classified once and cached on the
  line (at most 25 new ones per run). Without Claude, only keyword matches are listed, labelled as
  not a classification.
- **Invoice reading:** on a shipment, upload a commercial invoice (PDF or image up to 4 MB).
  Claude copies out parties, currency, total and lines; the app re-checks the arithmetic and shows
  warnings. **Apply** fills only blank fields (never overwrites), drops HTS codes that are not
  10 digits, and does not convert non-USD values. The file itself is not stored, only what was read.
  An invoice total that differs from the declared value raises a DocuPilot finding.
- Text read from documents is treated as untrusted. The model returns fields only; nothing it
  returns triggers an action.

## Custom domain (globlexai.io)

The app is hosted on Netlify. To serve it at `globlexai.io`:

1. Netlify, then Domain management, then Add a domain: `globlexai.io` (accept `www.globlexai.io` too).
2. DNS at your registrar: an `A` record for the apex pointing to `75.2.60.5` and a `CNAME` for `www` pointing to your `*.netlify.app` address (or switch the nameservers to Netlify DNS). Use the exact records Netlify shows if they differ.
3. Once DNS has propagated, verify DNS and provision the HTTPS certificate in Netlify.
4. Then update everything that holds the old address:
   - Netlify environment: `APP_BASE_URL=https://globlexai.io`
   - GitHub repository secret `APP_BASE_URL` (used by the hourly agent workflow)
   - QuickBooks (only if connected): `QBO_REDIRECT_URI=https://globlexai.io/api/auth/callback`, and the same redirect URI in the Intuit app
   - People who installed the app from the old address need to install it again from the new one; installs belong to one address.
