import { differenceInCalendarDays, startOfDay } from "date-fns";

// Alert classification per DESIGN_ARCHITECTURE_GUIDE 9.1 and thesis
// Table 3.1. Level is derived live from days remaining, never trusted
// from storage, so a threshold change by the administrator recasts the
// whole ledger immediately.

export type Level = "ACTIVE" | "WARNING" | "CRITICAL" | "EXPIRED";

export function classifyLevel(
  days: number,
  warningMax: number,
  criticalMax: number,
): Level {
  if (days < 0) return "EXPIRED";
  if (days <= criticalMax) return "CRITICAL";
  if (days <= warningMax) return "WARNING";
  return "ACTIVE";
}

export function daysUntil(expiry: Date, from: Date = startOfDay(new Date())): number {
  return differenceInCalendarDays(expiry, from);
}

export const LEVEL_ORDER: Level[] = ["EXPIRED", "CRITICAL", "WARNING", "ACTIVE"];