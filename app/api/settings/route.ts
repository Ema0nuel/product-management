import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticate } from "@/lib/guard";

// The alert threshold endpoint. Administrator only (guide 10, Table 3.2).
//
// The pair must stay ordered, critical closer than warning, or the
// classification in lib/expiry.ts would have an unreachable band and a
// batch could never be CRITICAL. The database carries the same check as a
// constraint, so a direct connection cannot break the invariant either.

const thresholdSchema = z
  .object({
    warning_max: z
      .number({ message: "Enter the warning boundary as a number of days." })
      .int("Give a whole number of days.")
      .min(1, "The warning boundary must be at least 1 day.")
      .max(365, "The warning boundary holds at most 365 days."),
    critical_max: z
      .number({ message: "Enter the critical boundary as a number of days." })
      .int("Give a whole number of days.")
      .min(0, "The critical boundary cannot be negative.")
      .max(364, "The critical boundary holds at most 364 days."),
  })
  .refine((values) => values.critical_max < values.warning_max, {
    message: "The critical boundary must fall closer than the warning boundary.",
    path: ["critical_max"],
  });

export async function PATCH(request: Request) {
  const auth = await authenticate("configure_thresholds");
  if (auth.error) return auth.error;

  const parsed = thresholdSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const { warning_max, critical_max } = parsed.data;

  // Single row, id pinned to 1 (guide 6.7). Upsert so a database built by
  // hand from supabase/schema.sql, or one missing the seed row, still works.
  const settings = await db.appSettings.upsert({
    where: { id: 1 },
    update: { warning_max, critical_max },
    create: { id: 1, warning_max, critical_max },
  });

  return NextResponse.json({ ok: true, settings });
}
