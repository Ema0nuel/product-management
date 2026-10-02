import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/guard";
import { DISPOSITIONS, dispositionLabel } from "@/lib/actions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// The action records sheet: every disposition ever recorded, newest first,
// with the account and the clock behind it (thesis 3.5.2, Table 3.2). All
// three roles hold view_action_records, so this sheet is the manager's
// read-only window and the officer's own audit trail at once. Recording
// stays on the dashboard beside the batch list (thesis 3.8); nothing on
// this sheet writes.

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  await requirePermission("view_action_records");

  const actions = await db.action.findMany({
    orderBy: { created_at: "desc" },
    include: {
      user: { select: { username: true } },
      batch: { include: { product: { select: { name: true } } } },
    },
  });

  // The sheet keeps one clock, so every stamp is set server-side.
  const rows = actions.map((action) => ({
    action_id: action.action_id,
    // A disposition is not an alert level, so it never takes a level ink;
    // the stamp stays in the neutral set (DESIGN.md, Semantic Ink Rule).
    disposition: action.disposition,
    remark: action.remark,
    created_at: format(action.created_at, "dd MMM yyyy, HH:mm"),
    username: action.user.username,
    product_name: action.batch.product.name,
    batch_number: action.batch.batch_number,
  }));

  const counts = Object.fromEntries(DISPOSITIONS.map((d) => [d, 0])) as Record<
    (typeof DISPOSITIONS)[number],
    number
  >;
  for (const row of rows) counts[row.disposition as (typeof DISPOSITIONS)[number]] += 1;

  const accounts = new Set(rows.map((row) => row.username)).size;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Action Records
          </h1>
          <p className="text-sm text-muted-foreground">
            Every disposition with the account that recorded it and the time of recording.
            Newest first.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Read-only. Dispositions are recorded from the dashboard.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {[
          ...DISPOSITIONS.map((disposition) => ({
            key: disposition,
            label: dispositionLabel(disposition),
            value: counts[disposition],
            className: "bg-secondary text-secondary-foreground",
          })),
          {
            key: "total",
            label: "Total records",
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
        {rows.length} {rows.length === 1 ? "record" : "records"} across {accounts}{" "}
        {accounts === 1 ? "account" : "accounts"}, newest first.
      </p>

      <div className="mt-6 overflow-x-auto border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Recorded</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Disposition</TableHead>
              <TableHead>Remark</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.action_id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {row.created_at}
                </TableCell>
                <TableCell className="font-medium">{row.username}</TableCell>
                <TableCell>{row.product_name}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {row.batch_number}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{dispositionLabel(row.disposition)}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.remark ?? "None"}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No dispositions recorded yet. Work a batch off the dashboard and the
                  record lands here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
