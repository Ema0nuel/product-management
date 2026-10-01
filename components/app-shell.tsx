import { format } from "date-fns";
import { LayoutGrid } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { AppNavMobile } from "@/components/app-nav-mobile";
import { PollRefresher } from "@/components/poll-refresher";
import { SignOutButton } from "@/components/sign-out-button";
import { roleLabel } from "@/lib/rbac";
import type { SessionUser } from "@/lib/auth";

// The sheet frame. Masthead, section strip, page body and the mobile tab
// bar; every signed-in screen renders inside it, so the ledger grammar and
// the role-filtered navigation are stated once.
//
// The refresh poll lives here rather than on the dashboard: every view
// reflects the data layer within the same 30-60s interval (guide 11).

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PollRefresher />

      <header className="px-4 pt-6 sm:px-8">
        <div className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center border border-border bg-card">
              <LayoutGrid className="size-5 text-foreground" strokeWidth={1.5} />
            </span>
            <div>
              <p className="text-lg leading-tight font-semibold tracking-tight text-foreground">
                Goods-Inward Ledger
              </p>
              <p className="text-xs text-muted-foreground">
                Product Expiry Alert Management System ·{" "}
                {format(new Date(), "EEEE, dd MMMM yyyy")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">{user.username}</p>
              <p className="text-xs text-muted-foreground">{roleLabel(user.role)}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <AppNav role={user.role} />

      <main className="flex-1 px-4 pt-6 pb-20 sm:px-8 md:pb-10">{children}</main>

      <AppNavMobile role={user.role} />
    </div>
  );
}
