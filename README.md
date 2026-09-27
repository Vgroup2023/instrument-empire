# Accounts Copilot

A financial insights **and actions** app for the accounts department, built on top of
QuickBooks Online. It's a Next.js 14 (App Router + TypeScript + Tailwind) app with no
external UI/chart libraries — everything is hand-rolled so the dependency footprint stays
tiny and auditable.

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

Everything under **Insights** and the core of **Actions** (invoices, estimates, recurring
schedules, customers, products) runs against your real QuickBooks Online company through the
public Accounting API once you connect it.

Four areas use a separate Intuit product that isn't part of the standard Accounting API scope,
so they run on realistic in-memory/on-disk demo data by default:

| Feature | Env var | Why |
|---|---|---|
| Payment links | `PAYMENTS_PROVIDER` | Standalone payment links are a QuickBooks Payments feature, not the Accounting API. |
| Payroll | `PAYROLL_PROVIDER` | QuickBooks Payroll has its own product, API, and scopes. |
| QuickBooks Capital | `CAPITAL_PROVIDER` | Loan/lending data is a separate Intuit lending product. |
| Industry benchmarking | `BENCHMARK_PROVIDER` | Requires Intuit's benchmarking product for your industry code/region. |

Each defaults to `mock`. The UI, the confirm-before-send flow, and all the CRUD screens are
fully functional either way — only the underlying data source changes. Each corresponding
module (`src/lib/quickbooks/payments.ts`, `payroll.ts`, `capital.ts`, `benchmark.ts`) has a
single, clearly-commented spot to wire in the real Intuit API call once that product access is
provisioned; flip the env var to `live` after doing so.

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

> **Note:** this repository was scaffolded in a sandboxed environment without access to the
> npm registry, so dependencies could not be installed or the build verified there. Run
> `npm install` in a normal environment with internet access before your first `npm run dev`
> or `npm run build`.

Open the app, sign in with `APP_PASSWORD`, then go to **Settings & connection** and click
**Connect QuickBooks** to authorize against your sandbox or real company.

## Recurring schedules

`POST /api/recurring/run-due` finds every active schedule whose next run date has arrived,
creates the invoice/estimate through QuickBooks, optionally emails it, and advances the
schedule. Trigger it once a day from whatever scheduler you have available, e.g.:

```
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-app.example.com/api/recurring/run-due
```

Set `CRON_SECRET` in your environment so only your scheduler can call it (the route is
otherwise exempt from the app's login gate, since it's not called by a browser). If
`CRON_SECRET` is unset, the route accepts any caller — fine for local testing, not for
production.

Recurring schedules (and the demo payment links/payroll data) are stored as JSON files under
`data/`, which requires a persistent filesystem. That's true of a normal Node process,
container, or VM, but **not** of most serverless platforms, whose filesystem resets between
invocations — swap `src/lib/store/jsonStore.ts` for a real database/KV store if you deploy
there.

## Security notes

- The whole app sits behind a single shared passphrase (`APP_PASSWORD`), checked in
  `src/middleware.ts` via a signed, httpOnly cookie — this is an internal tool for one
  business's accounts team, not a multi-tenant product.
- QuickBooks tokens are stored the same way (signed, httpOnly, `secure` in production) and
  refreshed automatically before they expire.
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
