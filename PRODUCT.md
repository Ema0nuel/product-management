# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16.3.6 (App Router), React 19, TypeScript, Tailwind CSS v4. Data
access via Prisma on Supabase (PostgreSQL).

Decision recorded 2026-09-30: the engineering guide chose SQLite for local
development, portable to PostgreSQL or MySQL. The user directed Supabase
instead, because it is SQL-based and easier to deploy. The thesis itself
records the database generically as relational and never names PostgreSQL;
the guide's "portable to PostgreSQL or MySQL" line is the only mention.

## Users

- Inventory officers and storekeepers. They register products, categories
  and batches; monitor alerts; record dispositions. They work from the
  shelves near stock, so the interface must be usable on mobile and desktop.
- Managers and business owners. They rely on the storekeepers' records to
  know which stock is at risk. Read-only view of the dashboard and action
  records.
- System administrators. Account management and alert-threshold
  configuration, plus all inventory-officer capabilities.
- The customer is an indirect actor whose safety depends on expired products
  being removed before they can be sold.

The evaluation (thesis 3.9) runs with real storekeepers and managers at the
case-study establishment. The establishment is not named; the user directs a
generic, domain-neutral build.

## Product Purpose

Replace manual, memory-dependent expiry tracking with automated date
comparison, multi-level alert classification, an expiry-priority FEFO
dashboard, in-app alerts and attributable action records. Success means no
batch depends on a staff member remembering to inspect it, urgent batches
surface first, and every disposition is recorded with user identity and
time.

## Positioning

Occupies the position the reviewed literature leaves empty (thesis 3.3.1):
no identified source combines product and category registration, batch-level
expiry tracking, multi-level classification by days remaining, an
expiry-priority FEFO dashboard, in-app alert delivery and structured action
tracking in one TypeScript and Next.js web application. Departs from the
Friday and Sorlihu reference system (daily run, single 30-day threshold,
email notification) by going in-app, multi-level, and extending notification
into prioritisation and action tracking.

## Operating Context

Three-tier architecture (thesis 3.4.1). React and Next.js presentation
layer, Next.js server application layer (authentication, session, monitoring
process, classification engine, queries, action recording), relational
database. The dashboard polls on an interval of thirty to sixty seconds; the
design claims real-time only within that one interval and adds no websocket
or push infrastructure.

The batch is the unit of monitoring. Two batches of one product carry
different expiry dates and are never merged. Domain is domain-neutral:
categories, products and batches are entered by the user during testing;
during this build, sample data is used for testing only.

## Capabilities and Constraints

Capabilities:

- Role-based login with hashed passwords (thesis 3.7).
- Product and category registration.
- Batch management: batch number, quantity, manufacturing date, expiry date,
  storage location.
- Automated expiry monitoring and classification into ACTIVE, WARNING,
  CRITICAL, EXPIRED (Table 3.1), on batch registration and each scheduled
  pass.
- Expiry-priority dashboard ordered by earliest expiry date (FEFO), each
  batch row showing product, batch number, quantity, expiry date, days
  remaining and alert-level badge.
- Action tracking: dispositions REMOVED, RETURNED, SOLD, DISCOUNTED,
  DISPOSED, with optional remark, recorded with user identity and time.
- In-app notifications as dashboard badges, level colours and priority lists
  only; no mail server.
- Three roles: system_admin, inventory_officer, manager. Inventory officer
  does the daily work. Manager is read-only. System administrator adds user
  and threshold management.
- Alert thresholds configurable by the system administrator, defaulting to
  warning_max 30 and critical_max 7, held in a single key-value settings
  record (implementation detail, not a sixth core entity).

Constraints:

- No point-of-sale, payments, AI-based expiry prediction or IoT sensing
  (thesis 3.6 scope boundaries).
- The engine classifies but never physically acts; a wrong expiry date
  produces a wrong level, and the system verifies the process of
  classification, not the physical condition of the product (thesis 3.4.3).
- Alert delivery is in-application only (thesis 3.3.3, 3.4.3).
- Role boundaries are enforced on the server (thesis 3.7).
- Days remaining is computed at read time, not stored; alert_level is
  written by the engine. Current disposition derives from the most recent
  action; a batch with no action is PENDING (thesis 3.6.8, guide 6.8).
- Real-time means within one polling interval of 30 to 60 seconds; no
  sub-second claim (thesis 3.4.1).
- Mobile and desktop both in mind for responsiveness.

## Brand Commitments

Name is "Product Expiry Alert Management System" as stated in the thesis. No
logo, slogan, domain, or other identity commitments recorded. The thesis
figures are black and white, but that rule applies to thesis figures only,
not to the software interface (guide 11).

## Evidence on Hand

- docx/Chapter 3.docx, the authoritative thesis chapter, with its plain-text
  extraction at docx/Chapter 3.plain.txt.
- docx/DESIGN_ARCHITECTURE_GUIDE.md, the engineering translation. When guide
  and thesis disagree, the thesis wins.
- app/ is currently Next.js starter boilerplate only: layout.tsx, page.tsx,
  globals.css. No Prisma schema, no auth, no routes yet.
- No real facility data, testimonials, customers, pricing or deployment
  claims. Sample data written during this build is test data only and will
  be replaced by manual input during evaluation.

## Product Principles

1. The batch is the unit of monitoring; two batches of one product carry
   different expiry dates and are never merged into one item.
2. Automated date comparison replaces human memory and hand calculation; no
   batch depends on a staff member remembering to inspect it.
3. FEFO ordering rules the attention list; the batch next to expire appears
   first.
4. Alerts and dispositions are structured, attributable records with user
   identity and time; an alert terminates in a recorded decision, not a
   notification.
5. Role boundaries and classification logic live on the server; the client
   never decides who may act.

## Accessibility & Inclusion

Mobile and desktop responsiveness is a hard requirement (user-directed).
No product-specific accessibility standard was established; keyboard
operability and readable contrast are treated as baseline quality.