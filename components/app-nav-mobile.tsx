"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, LayoutGrid, Package, SlidersHorizontal, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive, navForRole, type NavIcon } from "@/lib/nav";
import type { SessionRole } from "@/lib/auth";

// Mobile tab bar. The officer reads this standing at the shelf, so the tabs
// sit under the thumb rather than at the top: a fixed ruled bar on the sheet
// edge, one column per destination, the active tab inked with a rule along
// the top edge. Column count is the item count, so the bar reflows for three
// tabs or four without a layout change.
//
// Hidden from md up, where AppNav takes over. Both read navForRole().

const ICONS: Record<NavIcon, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  dashboard: LayoutGrid,
  records: ClipboardList,
  products: Package,
  categories: Tag,
  settings: SlidersHorizontal,
};

export function AppNavMobile({ role }: { role: SessionRole }) {
  const pathname = usePathname();
  const items = navForRole(role);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Inventory sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background md:hidden"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = ICONS[item.icon];
          return (
            <li key={item.key} className="border-l border-border first:border-l-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.hint}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 px-1 py-2.5 transition-colors focus-visible:outline-1 focus-visible:outline-ring",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {active && (
                  <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-foreground" />
                )}
                <Icon className="size-4 shrink-0" strokeWidth={1.5} />
                <span className="w-full truncate text-center text-[0.65rem] leading-none font-medium tracking-wide uppercase">
                  {item.short}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
