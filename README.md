# Product Expiry Alert Management System

A stock control register built for a thesis on expiry alerting. It keeps track of products, their categories and their stock batches, and it tells an officer which stock is close to going off before it does. Alerting is the point of the system. It does not price anything, total anything or print an invoice.

## What it does

Three roles sign in, and the navigation tabs change to match the role.

The dashboard is a goods-inward ledger. Every batch is listed in first-expired-first-out order with its alert level worked out live from today's date against the administrator's thresholds, which default to 30 days for a warning and 7 days for critical.

The product register carries the product record itself: category, description, manufacturing date, expiry date and storage location. On top of that it runs a comparison system. Today's date is set against every product's expiry date and the register sorts the results into windows: expired, within 2 weeks, within 1 month, within 2 months, more than 2 months. Anything inside two months appears at the top of the page with its exact expiry date and the days remaining, so the officer reads off which product is closest and what date it hits.

Each product opens a detail page. From there the product can be edited, marked on sale, taken off sale, or struck off as disposed. Disposal is terminal. It records the date and the account that did it, and the system refuses to send the product back to the shelf afterwards.

Batches remain the stock-lot ledger behind the dashboard. Prices, costs and money are deliberately absent throughout.

## Roles

Access follows Table 3.2 of the guide. The matrix lives in `lib/rbac.ts` and route guards in `lib/guard.ts`.

system_admin sees and does everything. inventory_officer manages products, categories and batches and records actions. manager reads the dashboard only.

## Two expiry ladders

They are kept apart on purpose, because they answer different questions.

`lib/expiry.ts` classifies batches for the dashboard from the administrator's thresholds in `app_settings`, giving ACTIVE, WARNING, CRITICAL or EXPIRED.

`lib/product-expiry.ts` is the product comparison ladder with fixed reporting windows of 14, 30 and 60 days, giving EXPIRED, DUE_2_WEEKS, DUE_1_MONTH, DUE_2_MONTHS or SAFE.

Both count days the same way with `differenceInCalendarDays` against the start of today, so they never disagree about how many days are left.

## Setup

Requires Node.js 24 and a PostgreSQL database. The build targets Supabase.

```bash
npm install
cp .env.example .env
```

Fill `DATABASE_URL` in `.env` with the Supabase session pooler connection string on port 5432, for example `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`. The session pooler is the one that works with this driver adapter. The transaction pooler on port 6543 does not, and the direct `db.<ref>.supabase.co` host is IPv6 only. Set `SESSION_SECRET` to a long random string; it signs the session cookie.

Then either apply the schema directly:

```bash
# paste supabase/schema.sql into the Supabase SQL editor, or
psql "$DATABASE_URL" -f supabase/schema.sql
```

or let Prisma manage it:

```bash
npx prisma generate
npx prisma migrate deploy
```

`supabase/schema.sql` and `prisma/migrations/` are kept in step. Either path gives the same database.

Seed the build-test data:

```bash
npm run seed
```

That creates one user per role, four categories, twelve products with expiry dates spread across every window, ten batches, and the settings row. All three passwords are `password123`.

Start the server:

```bash
npm run dev
```

Open http://localhost:3000 and sign in as `admin`, `officer` or `manager`.

## Scripts

```bash
npm run dev        # start the development server
npm run build      # production build
npm run start      # serve the production build
npm run lint       # eslint
npx tsc --noEmit   # typecheck
npm run seed       # load build-test data, safe to re-run
```

## Checking the schema

`supabase/verify-schema.cjs` runs `supabase/schema.sql` twice inside a rolled-back transaction and asserts the tables, enums, columns, indexes, constraints, row level security and classification behaviour. It never touches the live database.

```bash
node supabase/verify-schema.cjs
```

## Layout

```
app/(app)/                  signed-in shell, role-filtered tabs
  dashboard/                FEFO batch ledger and alert counts
  products/                 register, close-to-expiry list, product detail
  categories/               category management
  settings/                 users, thresholds, inventory settings
app/api/                    route handlers, each guarded by role
components/                 forms, actions and ui primitives
lib/                        auth, guards, rbac, db, the two expiry ladders
prisma/schema.prisma        source of truth for the Prisma client
supabase/schema.sql         source of truth for a fresh Supabase database
DESIGN.md                   design system: The Goods-Inward Ledger
PRODUCT.md                  captured product scope
```

## Design

The visual system is documented in `DESIGN.md`. Stock paper ground, flat ink, sharp corners, no shadows or gradients. Numbers and dates sit in tabular figures. Alert level is shown as a rectangular stamp in one of four level inks, and those inks are used for expiry urgency and nothing else.
