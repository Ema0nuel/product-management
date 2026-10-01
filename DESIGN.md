<!-- SEED: established with the user before implementation; re-run $impeccable document once there's code to capture the actual tokens and components. -->

---
name: Product Expiry Alert Management System
description: Batch-level expiry tracking with multi-level alert classification, FEFO prioritisation and structured action records.
---

# Design System: Product Expiry Alert Management System

## Overview

**Creative North Star: "The Goods-Inward Ledger"**

The interface presents the expiry-priority dashboard as a ruled goods-inward ledger sheet, the warehouse stock-control card and goods-inward ledger made live. FEFO runs the order and the level ink marks the state. The batch next to expire appears first, its alert column edged in the ink of its level, and a stamp-style summary strip across the top counts the batches in each level before the list is opened.

This is an operate-mode product. Inventory officers work the list daily from the shelves, managers read the same record read-only, and the administrator reaches account and threshold configuration inside the same sheet grammar. The dashboard is a working record, not a teaser: figures are set dense and tabular, and every row carries the product name, batch number, quantity, expiry date, days remaining and the current alert level. The sheet governs every screen and no chrome exists outside the ledger, the Garden Commitment raised from the gravity-rain garden. The material moves the grade of urgency the manual process lacked into the ink itself: red for expired, amber for critical, mustard for warning, and a muted mark for active stock.

The sheet keeps still. The dashboard refreshes on the polling interval of thirty to sixty seconds and a change in urgency shows as a change of ink, not as motion. No websocket, no push, no continuous animation; the alert terminates in a recorded disposition, not in a celebration.

**Key Characteristics:**
- One governing material, the ruled ledger sheet, on every screen.
- Tabular, dense figures; the dashboard is a working record.
- Level ink carries the state: red expired, amber critical, mustard warning, muted active.
- FEFO ordering is absolute; the batch next to expire leads.
- Flat ink-on-paper rendering; no shadows, no rounded cards.

## Colors

The palette is the ink set of a working ledger: aged stock paper, ledger ink, three level inks and a muted neutral for chrome. The level inks are semantic. Each marks one alert level and appears nowhere else.

### Primary
- **Ink-Stamp Red** (#a0352a): the EXPIRED level. Past-date batches, their badges and column edges. The strongest mark on the sheet.

### Secondary
- **Critical Amber** (#c8791f): the CRITICAL level. Batches expiring within seven days.

### Tertiary
- **Warning Mustard** (#e0b03e): the WARNING level. Batches expiring within thirty days.

### Neutral
- **Aged Stock Paper** (#f4f1ea): the ground. Every screen sits on the paper.
- **Ledger Ink** (#21241f): text, rules and column heads.
- **Muted Olive** (#6b7264): secondary text, the ACTIVE level mark, borders and quiet chrome.

### Named Rules
**The One-Sheet Rule.** One governing material, the ruled ledger sheet, owns every screen; no chrome exists outside it.
**The Semantic Ink Rule.** A level ink marks its alert level only. It decorates nothing else, gradients and tinted panels included.
**The Neutral Active Rule.** The ACTIVE level takes the muted olive, not a colored ink. Only WARNING, CRITICAL and EXPIRED carry color.

## Typography

Character: dense and tabular, set for shelf-side reading at a glance. Tabular lining figures are committed by the data-density raise, so the days-remaining and expiry numerals align column to column across every row. The ledger is a record read standing up, and legibility at small sizes outranks display flourish.

**Display Font:** [to be resolved during implementation]
**Body Font:** [to be resolved during implementation]
**Label/Mono Font:** [to be resolved during implementation]

### Hierarchy
- **Display** ([to be resolved]): the product name once per screen, set quietly.
- **Body** ([to be resolved]): rows and forms; the working face.
- **Label** ([to be resolved], tracked, uppercase where it reads as a column head): column heads, badges and stamps.
- **Numerals** (tabular, always): quantities, dates and days remaining.

### Named Rules
**The Tabular Figures Rule.** Every figure is set in tabular lining numerals so the numeric columns align, row to row.
**The Stamped Label Rule.** Badges read as ink stamps: rectangular blocks of level ink on paper, never pill chips.

## Layout

One ruled sheet fills the first viewport. A summary strip runs across the top: the count in each level, presented as stamps or inked columns, visible before the list opens. The batch list follows in ruled rows ordered by earliest expiry date under FEFO, each row carrying the product name, batch number, quantity, expiry date, days remaining and the level mark in its colored edge.

The action-tracking controls sit beside the list for the inventory officer. The manager sees the same sheet read-only. The administrator reaches user management and threshold configuration on their own sheets in the same grammar.

Responsive: mobile and desktop are both required. On desktop the full row reads across the sheet. On mobile the ruled structure collapses to a single narrow column, keeping the FEFO order and the level ink legible, with the summary strip staying on top.

## Elevation & Depth

Flat by nature: ink on aged paper, no shadows, no lift. Depth is conveyed by rule weight, ink density and the stamp effect, never by elevation. The most urgent ink reads as the heaviest mark on the sheet.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest and in every state. No shadows, gradients or glass; the sheet renders ink on paper.

## Shapes

Sharp corners throughout. Columns separate by hairline rules, the sheet grid is ruled, and badges are rectangular ink stamps with square corners. Nothing is pill-shaped; nothing rounds beyond the trace a touch target needs on mobile.

## Do's and Don'ts

### Do:
- **Do** keep the ruled ledger sheet as the one governing material on every screen; no chrome outside the ledger.
- **Do** set figures tabular and dense; the dashboard is a working record, not a teaser.
- **Do** mark alert state with the level ink and nothing else: red expired, amber critical, mustard warning, muted active.
- **Do** keep FEFO order absolute; the batch next to expire appears first.
- **Do** show the summary strip counts on open, before the list.

### Don't:
- **Don't** let the design fall to a plain table; the ruled structure and level-ink idioms commit at full density.
- **Don't** use soft shadows, rounded cards, gradients or glass; ink on paper only.
- **Don't** scatter the level inks as decoration; they mark state only.
- **Don't** hide urgency behind tooltips, drill-ins or hover; urgency is visible in the row itself.
- **Don't** give the manager a reduced sheet; the read-only view carries the same data as the officer's.