import { requireUser } from "@/lib/guard";
import { AppShell } from "@/components/app-shell";

// Every signed-in route groups under here, so the session check and the
// sheet frame are stated once instead of repeated per page.

export const dynamic = "force-dynamic";

export default async function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
