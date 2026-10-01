import { format } from "date-fns";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/guard";
import { roleLabel } from "@/lib/rbac";
import { ThresholdForm } from "@/components/threshold-form";
import { NewAccountButton, UserRowActions } from "@/components/user-form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Inventory Settings: the administrator's own sheet (guide 10, Table 3.2).
// Two things live here and nothing else, the alert thresholds that decide
// how the ledger ink is applied, and the accounts that may touch the
// ledger. Both are administrator-only, enforced on the server.

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requirePermission("configure_thresholds");

  const [settings, accounts] = await Promise.all([
    db.appSettings.findUnique({ where: { id: 1 } }),
    // password_hash is never selected, so it cannot reach the client.
    db.user.findMany({
      select: { user_id: true, username: true, role: true, created_at: true },
      orderBy: [{ role: "asc" }, { username: "asc" }],
    }),
  ]);

  const warningMax = settings?.warning_max ?? 30;
  const criticalMax = settings?.critical_max ?? 7;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 border-b border-border pb-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Inventory Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          The alert boundaries the whole ledger is read against, and the accounts
          that may record against it.
        </p>
      </div>

      <section className="mt-6 border border-border bg-card">
        <div className="flex flex-col gap-1 border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            Alert thresholds
          </h2>
          <p className="text-sm text-muted-foreground">
            The two day boundaries behind the WARNING and CRITICAL levels. Days
            remaining is recomputed on every read, so a change here repaints the
            whole ledger at the next refresh.
          </p>
        </div>
        <ThresholdForm warningMax={warningMax} criticalMax={criticalMax} />
      </section>

      <section className="mt-8 border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">
              User accounts
            </h2>
            <p className="text-sm text-muted-foreground">
              {accounts.length} {accounts.length === 1 ? "account" : "accounts"} on
              file. Every recorded action carries the identity of the account that
              filed it.
            </p>
          </div>
          <NewAccountButton />
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.user_id}>
                  <TableCell className="font-medium">{account.username}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {roleLabel(account.role)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {format(account.created_at, "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <UserRowActions
                      account={{
                        user_id: account.user_id,
                        username: account.username,
                        role: account.role,
                      }}
                      isSelf={account.user_id === user.userId}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {accounts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    No accounts on file.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
