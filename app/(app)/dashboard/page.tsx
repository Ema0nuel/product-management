import { differenceInCalendarDays, format } from "date-fns";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { classifyLevel, type Level } from "@/lib/expiry";
import { runMonitoringPass } from "@/lib/monitoring";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BatchAction, type ActionRecord } from "@/components/batch-action";

// The goods-inward ledger: FEFO-ordered batch register with a level-ink
// summary strip. In-app polling only; the shell refreshes this server
// component on the 30-60s interval.

export const dynamic = "force-dynamic";

const stamp: Record<Level, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-level-active text-background" },
  WARNING: { label: "Warning", className: "bg-level-warning text-foreground" },
  CRITICAL: { label: "Critical", className: "bg-level-critical text-background" },
  EXPIRED: { label: "Expired", className: "bg-level-expired text-background" },
};

const daysText: Record<Level, string> = {
  ACTIVE: "text-muted-foreground",
  WARNING: "text-level-warning",
  CRITICAL: "text-level-critical",
  EXPIRED: "text-level-expired",
};

function dayLabel(days: number): string {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  return `${days}d`;
}

export default async function DashboardPage() {
  const user = await requireUser();

  // The scheduled monitoring pass (guide 9.1): this page re-runs on the
  // poll interval, so each refresh classifies every batch and stores the
  // level back on the row. Display below stays computed at read time.
  await runMonitoringPass();

  const settings = await db.appSettings.findUnique({ where: { id: 1 } });
  const warningMax = settings?.warning_max ?? 30;
  const criticalMax = settings?.critical_max ?? 7;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const batches = await db.batch.findMany({
    orderBy: { expiry_date: "asc" },
    include: {
      product: { include: { category: true } },
      actions: {
        orderBy: { created_at: "desc" },
        include: { user: { select: { username: true } } },
      },
    },
  });

  const canRecord = can(user.role, "record_action");

  const rows = batches.map((b) => {
    const days = differenceInCalendarDays(b.expiry_date, today);
    // Action records travel to the cell pre-formatted: the sheet keeps one
    // clock, so every stamp on it is set server-side.
    const history: ActionRecord[] = b.actions.map((a) => ({
      action_id: a.action_id,
      disposition: a.disposition,
      remark: a.remark,
      created_at: format(a.created_at, "dd MMM yyyy, HH:mm"),
      username: a.user.username,
    }));
    return {
      batch: b,
      days,
      level: classifyLevel(days, warningMax, criticalMax),
      latest: history[0] ?? null,
      history,
    };
  });

  const counts: Record<Level, number> = {
    ACTIVE: 0,
    WARNING: 0,
    CRITICAL: 0,
    EXPIRED: 0,
  };
  let totalUnits = 0;
  for (const r of rows) {
    counts[r.level] += 1;
    totalUnits += r.batch.quantity;
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Expiry-Priority Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Batches ordered by earliest expiry, FEFO. Updated{" "}
            {format(new Date(), "HH:mm:ss")}.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Thresholds: warning at {warningMax} days, critical at {criticalMax} days.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-5">
        {[
          ...(["ACTIVE", "WARNING", "CRITICAL", "EXPIRED"] as Level[]).map((level) => ({
            key: level,
            label: stamp[level].label,
            value: counts[level],
            className: stamp[level].className,
          })),
          {
            key: "total",
            label: "Total batches",
            value: rows.length,
            className: "bg-primary text-primary-foreground",
          },
        ].map((cell) => (
          <div key={cell.key} className={`flex flex-col gap-0.5 px-4 py-3 ${cell.className}`}>
            <span className="text-2xl leading-none font-semibold tabular-nums">
              {cell.value}
            </span>
            <span className="text-xs font-medium tracking-wide uppercase opacity-80">
              {cell.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {totalUnits.toLocaleString()} units held across {rows.length} batches, ordered by
        earliest expiry.
      </p>

      <div className="mt-6 overflow-x-auto border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Expiry</TableHead>
              <TableHead className="text-right">Days left</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Disposition</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ batch: b, days, level, latest, history }) => (
              <TableRow key={b.batch_id}>
                <TableCell className="font-medium">{b.product.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {b.product.category.name}
                </TableCell>
                <TableCell className="text-right tabular-nums">{b.quantity}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {b.batch_number}
                </TableCell>
                <TableCell className="text-muted-foreground">{b.storage_location}</TableCell>
                <TableCell className="tabular-nums">
                  {format(b.expiry_date, "dd MMM yyyy")}
                </TableCell>
                <TableCell className={`text-right tabular-nums ${daysText[level]}`}>
                  {dayLabel(days)}
                </TableCell>
                <TableCell>
                  <Badge className={stamp[level].className}>{stamp[level].label}</Badge>
                </TableCell>
                <TableCell>
                  <BatchAction
                    batch={{
                      batch_id: b.batch_id,
                      batch_number: b.batch_number,
                      product_name: b.product.name,
                    }}
                    latest={latest}
                    history={history}
                    canRecord={canRecord}
                  />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  No batches on file. Add stock to start the ledger.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
