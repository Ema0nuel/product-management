import { differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";

// The product comparison ladder.
//
// lib/expiry.ts classifies stock alerts at the batch level from the
// administrator's thresholds. This module answers a different question the
// register needs: how far a product sits from its expiry date, in the
// windows the sheet reports on (2 weeks, 1 month, 2 months), with the
// exact date beside it. Windows are read live at render time, never stored,
// so a date edited today recasts every figure immediately.

export type ExpiryWindowKey =
  | "EXPIRED"
  | "DUE_2_WEEKS"
  | "DUE_1_MONTH"
  | "DUE_2_MONTHS"
  | "SAFE"
  | "NO_EXPIRY";

export type ExpiryWindow = {
  key: ExpiryWindowKey;
  label: string;
  days: number | null;
  /** Solid stamp fill, null when there is nothing to flag. */
  stampClass: string | null;
  /** Text colour for the days figure in a row. */
  textClass: string;
};

/** Boundaries of the reported windows, in days remaining. */
export const EXPIRY_WINDOWS = {
  TWO_WEEKS: 14,
  ONE_MONTH: 30,
  TWO_MONTHS: 60,
} as const;

/** A product inside this many days appears on the close-to-expiry list. */
export const WATCHLIST_DAYS = EXPIRY_WINDOWS.TWO_MONTHS;

const WINDOWS: Record<
  Exclude<ExpiryWindowKey, "NO_EXPIRY">,
  Omit<ExpiryWindow, "key" | "days">
> = {
  EXPIRED: {
    label: "Expired",
    stampClass: "bg-level-expired text-background",
    textClass: "text-level-expired",
  },
  DUE_2_WEEKS: {
    label: "Within 2 weeks",
    stampClass: "bg-level-critical text-background",
    textClass: "text-level-critical",
  },
  DUE_1_MONTH: {
    label: "Within 1 month",
    stampClass: "bg-level-warning text-foreground",
    textClass: "text-level-warning",
  },
  DUE_2_MONTHS: {
    label: "Within 2 months",
    stampClass: "bg-level-active text-background",
    textClass: "text-muted-foreground",
  },
  SAFE: {
    label: "More than 2 months",
    stampClass: null,
    textClass: "text-muted-foreground",
  },
};

const NO_EXPIRY: ExpiryWindow = {
  key: "NO_EXPIRY",
  label: "No expiry on file",
  days: null,
  stampClass: null,
  textClass: "text-muted-foreground",
};

function toDay(value: Date | string): Date {
  return typeof value === "string" ? parseISO(value) : value;
}

/** Days remaining until the date, using the same counting as lib/expiry.ts. */
export function daysUntilDate(
  expiry: Date | string,
  from: Date = startOfDay(new Date()),
): number {
  return differenceInCalendarDays(toDay(expiry), from);
}

/** Which window a product's expiry date falls in. Null reads as no expiry. */
export function expiryWindow(
  expiry: Date | string | null | undefined,
  from: Date = startOfDay(new Date()),
): ExpiryWindow {
  if (!expiry) return NO_EXPIRY;

  const days = daysUntilDate(expiry, from);
  let key: Exclude<ExpiryWindowKey, "NO_EXPIRY">;
  if (days < 0) key = "EXPIRED";
  else if (days <= EXPIRY_WINDOWS.TWO_WEEKS) key = "DUE_2_WEEKS";
  else if (days <= EXPIRY_WINDOWS.ONE_MONTH) key = "DUE_1_MONTH";
  else if (days <= EXPIRY_WINDOWS.TWO_MONTHS) key = "DUE_2_MONTHS";
  else key = "SAFE";

  return { key, days, ...WINDOWS[key] };
}

/** True while the product still belongs on the close-to-expiry list. */
export function isWatchlisted(window: ExpiryWindow): boolean {
  return window.key !== "SAFE" && window.key !== "NO_EXPIRY";
}

/** The days figure as it appears in a row: "3d", "Today", "4d overdue". */
export function daysLabel(days: number | null): string {
  if (days === null) return "No expiry";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  return `${days}d`;
}

/** "12 Mar 2026", or an em dash stand-in when no date is on file. */
export function formatExpiry(expiry: Date | string | null | undefined): string {
  if (!expiry) return "No expiry on file";
  return format(toDay(expiry), "dd MMM yyyy");
}
