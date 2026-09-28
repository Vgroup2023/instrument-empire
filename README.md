# Accounts Copilot

A proprietary, single-tenant financial insights **and actions** app for the accounts
department, built on top of QuickBooks Online. It's a Next.js 16 (App Router + TypeScript +
Tailwind) app with no external UI/chart libraries — everything is hand-rolled so the
dependency footprint stays tiny and auditable. This is not a product for resale or
multi-customer use — it's meant to be run by one business, for that business's own books.

## Before you rely on this for real, daily bookkeeping

- **Connect your real QuickBooks company** (Settings & connection) — until then, every
  screen either shows nothing or an explicit "not connected" state. Nothing here is
  seeded with fake data on purpose: a real accounting tool should never risk showing
  fabricated numbers that could be mistaken for your actual books.
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
  below. Everything QuickBooks-backed (reports, invoices, estimates, customers, products)
  is unaffected either way.
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
- Invoices and estimates (`/dashboard/invoices`, `/dashboard/estimates`): create, edit,
  duplicate, and email — plus scheduling them to recur (weekly/monthly/quarterly/yearly).
- Customers and products/services (`/dashboard/customers`, `/dashboard/products`): add new
  ones on the fly, used as line items and bill-to parties.
- Payment links and payment reminders (`/dashboard/payments`): create a link, email it, or
  nudge a customer with an overdue balance.
- **Every outbound action — sending an invoice/estimate, a reminder, or a payment
  link — goes through a preview-and-confirm dialog first.** Nothing is emailed without an
  explicit click on the exact content that will go out.

**Payables**
- Vendors and bills (`/dashboard/vendors`, `/dashboard/bills`): the Accounts Payable
  counterpart to Invoices/Customers — add vendors, record bills against an expense/COGS
  category, edit or duplicate a bill, and pay one from a real bank account. Everything here
  runs against the same real QuickBooks Accounting API as Invoices — no separate product or
  demo mode.

**Accounting**
- Chart of accounts (`/dashboard/accounts`): every account in your books — add a new one
  (bank, income, expense, and everything between), edit its name/number/description, and
  deactivate or reactivate one. QuickBooks doesn't allow hard-deleting an account or changing
  its type/category after creation, so this app doesn't offer either — deactivating is the
  real "delete" here, same as in QuickBooks itself.
- Journal entries (`/dashboard/journal-entries`): manual double-entry adjustments — accruals,
  corrections, depreciation, and the like. The line editor shows a running debit/credit total
  and won't let you save an out-of-balance entry, since QuickBooks would reject it anyway.

**Banking**
- Expenses (`/dashboard/expenses`): money paid immediately — by card, cash, or check — as
  opposed to a bill owed for later. Categorize each line to an expense/COGS account, same
  picker as bills.
- Transfers (`/dashboard/transfers`): move money between your own bank/credit card accounts.
  QuickBooks' own bank-reconciliation screen isn't exposed by the public Accounting API, so
  recording expenses and transfers accurately is as close as an app built on it can get —
  the actual "Reconcile" workflow still happens inside QuickBooks itself.

**People & money**
- Payroll (`/dashboard/payroll`): read-only answers (headcount, last/next payroll run),
  an employee directory with hire/employment status, and the ability to add an employee or
  set someone's base pay.
- QuickBooks Capital (`/dashboard/capital`): your loans and how your borrowing terms compare
  to peer businesses (read-only, as requested).

**Bank connections** live inside QuickBooks Online itself — once you connect your company
(below), any bank feeds you've linked in QuickBooks show up automatically in the Banking
center there, and their effects flow into the reports this app reads (cash flow, balance
sheet, etc). There's no separate bank-linking step in this app.

## What's live vs. demo data

Everything under **Insights**, the core of **Actions** (invoices, estimates, recurring
schedules, customers, products), all of **Payables** (vendors, bills, bill payments), all of
**Accounting** (chart of accounts, journal entries), and all of **Banking** (expenses,
transfers) runs against your real QuickBooks Online company through the public Accounting
API once you connect it.

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
APP_PASSWORD=            # shared passphrase that gates this internal tool
SESSION_SECRET=          # long random string (openssl rand -hex 32)
APP_BASE_URL=            # e.g. http://localhost:3000
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_ENVIRONMENT=sandbox  # or "production"
QBO_REDIRECT_URI=        # must exactly match the Intuit app's redirect URI
```

Leave `PAYMENTS_PROVIDER`, `PAYROLL_PROVIDER`, `CAPITAL_PROVIDER`, `BENCHMARK_PROVIDER` as
`mock` until you've provisioned the corresponding Intuit product.

### 3. Install and run

```
npm install
npm run dev
```

Open the app, sign in with `APP_PASSWORD`, then go to **Settings & connection** and click
**Connect QuickBooks** to authorize against your sandbox or real company.

## Deploying to Netlify

The repo includes a `netlify.toml` that pins the Next.js runtime plugin
(`@netlify/plugin-nextjs`, also listed in `devDependencies`), so deploying is mostly
point-and-click:

1. Push this repo to GitHub if it isn't already, then in the
   [Netlify dashboard](https://app.netlify.com) choose **Add new site → Import an existing
   project** and pick this repo. Netlify reads `netlify.toml` and auto-detects the Next.js
   runtime; no build settings need to change.
2. Before the first deploy (or right after, then redeploy), add these under **Site
   configuration → Environment variables**: `APP_PASSWORD`, `SESSION_SECRET`, `QBO_CLIENT_ID`,
   `QBO_CLIENT_SECRET`, `QBO_ENVIRONMENT`, `CRON_SECRET`, and optionally the four
   `*_PROVIDER` flags (they default to `mock` if omitted).
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
can start from a clean slate. That's fine for everything backed by QuickBooks (Insights,
Invoices, Estimates, Customers, Products, the login/connect flow) or by the signed-cookie
session, but the JSON-file store behind **recurring schedules**, **demo payment links**, and
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
