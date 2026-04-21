# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FreightEmpire** is a private, invite-only freight load board and carrier management platform for a U.S. freight brokerage. It is a full-stack web application with two user roles (Admin/Broker and Carrier) organized into **2 primary tabs** in the sidebar:

1. **Load Operations** — freight brokerage core (loads, carriers, bookings, dashboard)
2. **AI Marketing & Sales** — lead pipeline, AI-generated outreach via Claude API, campaign tracking

## Tech Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Frontend   | React 18 + Vite + Tailwind CSS                  |
| Backend    | Node.js + Express                               |
| Database   | SQLite via `better-sqlite3`                     |
| Auth       | JWT (stored in `localStorage`)                  |
| AI         | Anthropic SDK (`@anthropic-ai/sdk`) — Claude    |
| Uploads    | Multer (COI / W-9 documents)                    |
| Email      | Nodemailer (SMTP)                               |
| SMS        | Twilio                                          |

## Commands

### Setup
```bash
# From repo root — installs both workspaces
npm run install:all

# Copy and fill in env vars
cp .env.example backend/.env
```

### Development (both servers concurrently)
```bash
npm run dev          # starts backend :5000 + frontend :5173
```

### Individual servers
```bash
cd backend  && npm run dev   # Express API on :5000
cd frontend && npm run dev   # Vite dev server on :5173 (proxies /api → :5000)
```

### Production build
```bash
npm run build    # builds frontend/dist; serve backend statically or separately
npm start        # starts backend only
```

## Architecture

### Directory layout
```
instrument-empire/
├── backend/
│   ├── server.js              # Express entry — mounts all routes
│   ├── db/database.js         # SQLite init, schema creation, admin seed
│   ├── middleware/auth.js     # JWT verify; adminOnly; approvedCarrierOnly guards
│   ├── routes/
│   │   ├── auth.js            # POST /login, POST /register, GET /me
│   │   ├── carriers.js        # CRUD + status approval + FMCSA check + doc upload
│   │   ├── loads.js           # CRUD + carrier notification on new load
│   │   ├── bookings.js        # Carrier request flow + admin approve/reject
│   │   └── marketing.js       # Lead CRUD + AI generation + send + metrics
│   ├── services/
│   │   ├── notifications.js   # sendEmail / sendSMS (real or console-logged)
│   │   └── fmcsa.js           # FMCSA DOT/MC lookup (placeholder → real API)
│   ├── uploads/               # Multer-stored COI and W-9 files
│   └── data/                  # SQLite DB file (git-ignored)
└── frontend/
    └── src/
        ├── App.jsx            # React Router setup; PrivateRoute guard
        ├── context/AuthContext.jsx  # JWT login/logout state; persists via localStorage
        ├── services/api.js    # Axios instance; 401 → redirect to /login
        ├── components/
        │   ├── Layout.jsx     # 2-tab sidebar; role-aware nav items; mobile drawer
        │   ├── LoadCard.jsx   # Reusable freight load card
        │   ├── Modal.jsx      # Generic overlay modal
        │   └── StatCard.jsx   # KPI metric card
        └── pages/
            ├── Login.jsx
            ├── Register.jsx   # 3-step carrier onboarding wizard
            ├── admin/         # AdminDashboard, LoadManagement, CarrierManagement,
            │                  #   BookingManagement, AIMarketing
            └── carrier/       # CarrierDashboard, LoadBoard, MyBookings
```

### Data flow — key patterns

**Authentication**: `POST /api/auth/login` → JWT → stored in `localStorage` → sent as `Authorization: Bearer <token>` on every request → decoded in `middleware/auth.js` → `req.user` populated.

**Carrier lifecycle**: Register (Pending) → Admin reviews in CarrierManagement → FMCSA check → Approve/Reject → Email+SMS sent. Only Approved carriers can see the load board.

**Booking lifecycle**: Carrier clicks "Request Booking" → `POST /api/bookings` → status=Pending → Admin approves in BookingManagement → load status → Booked, other pending bookings → Rejected, notifications fired.

**AI outreach**: Admin opens AIMarketing tab → selects a lead → configures type/tone/objective → `POST /api/marketing/ai/generate` hits Claude API with a freight-brokerage system prompt → returns copy → admin edits/sends via `POST /api/marketing/ai/send` → lead status updated to Contacted.

**Notifications**: `services/notifications.js` wraps Nodemailer + Twilio. When `SMTP_HOST` / `TWILIO_ACCOUNT_SID` are absent, messages are console-logged and recorded in the `notifications` table as `Simulated`.

### Database tables
`users`, `carriers`, `loads`, `bookings`, `leads`, `notifications`, `ai_campaigns` — all created in `backend/db/database.js` with `CREATE TABLE IF NOT EXISTS`.

## Environment Variables

See `.env.example`. Place the file at `backend/.env`. Key vars:

| Variable             | Purpose                                      |
|----------------------|----------------------------------------------|
| `JWT_SECRET`         | Token signing key — change before production |
| `ADMIN_EMAIL/PASSWORD` | Seeded admin account (created on first run) |
| `ANTHROPIC_API_KEY`  | Required for AI marketing content generation |
| `SMTP_*`             | Email sending (optional — logs to console without) |
| `TWILIO_*`           | SMS sending (optional — logs to console without) |
| `FMCSA_API_KEY`      | FMCSA carrier lookup (optional — returns placeholder) |

## Tailwind Custom Tokens

`frontend/tailwind.config.js` defines `navy-{50..900}` (primary brand) and `freight-{orange,amber,green,red}` (accent). Use these instead of generic Tailwind color names to stay on-brand.

## CSS Utility Classes

`frontend/src/index.css` defines component-layer classes used throughout:
`btn-primary`, `btn-secondary`, `btn-orange`, `btn-danger`, `btn-success`, `card`, `input`, `label`, `badge`, `badge-{green,red,yellow,blue,gray,orange}`.

## Future Integration Points

The codebase is structured for these additions:
- **RMIS / SaferWatch / MyCarrierPackets**: replace `services/fmcsa.js` placeholder
- **Rate confirmations (PDF)**: add a `/api/bookings/:id/pdf` route using a PDF library
- **Payment integration**: add `payment_link` field to bookings table + Stripe/QuickPay webhook route
- **PostgreSQL migration**: swap `better-sqlite3` for `pg` + connection pool in `db/database.js`
