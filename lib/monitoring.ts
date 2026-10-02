import { db } from "@/lib/db";
import { classifyLevel, daysUntil } from "@/lib/expiry";
import type { AlertLevel } from "@/lib/generated/prisma/client";

// ClassifyBatch as an engine pass (guide 9.1, thesis 3.5.1). Registration
// writes the level once when a batch is filed; this is the scheduled half
// of the same procedure. It re-runs classification against the current
// date and the live thresholds, then stores the computed level back on
// the batch (step 11), so batches.alert_level tracks what the dashboard
// derives at read time instead of freezing at registration.
//
// Rows already holding the right level are left untouched, so a pass with
// no day or threshold change writes nothing. The pass runs automatically
// (guide 10, RBAC matrix), never on user command.

export async function runMonitoringPass(): Promise<{
  checked: number;
  updated: number;
}> {
  const settings = await db.appSettings.findUnique({ where: { id: 1 } });
  const warningMax = settings?.warning_max ?? 30;
  const criticalMax = settings?.critical_max ?? 7;

  const batches = await db.batch.findMany({
    select: { batch_id: true, expiry_date: true, alert_level: true },
  });

  // Classify from the recorded expiry date against the calendar day the
  // read path sees, the same comparison registration and the dashboard use.
  const stale: { batch_id: number; level: AlertLevel }[] = [];
  for (const batch of batches) {
    const level = classifyLevel(daysUntil(batch.expiry_date), warningMax, criticalMax);
    if (level !== batch.alert_level) {
      stale.push({ batch_id: batch.batch_id, level });
    }
  }

  if (stale.length > 0) {
    await db.$transaction(
      stale.map(({ batch_id, level }) =>
        db.batch.update({ where: { batch_id }, data: { alert_level: level } }),
      ),
    );
  }

  return { checked: batches.length, updated: stale.length };
}
