"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Package, SlidersHorizontal, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive, navForRole, type NavIcon } from "@/lib/nav";
import type { SessionRole } from "@/lib/auth";

// Desktop section strip. A ruled row of tabs sitting on the sheet, not a
// floating control: hairline lead rule between tabs, tracked uppercase
// labels, and the active tab marked with the heaviest ink on the row, a
// two-pixel rule on the sheet edge (DESIGN.md, The Stamped Label Rule and
// The Flat-By-Default Rule).
//
// The tab set is whatever navForRole() returns for the signed-in role, so a
// manager sees one tab, an officer sees three and the administrator sees
// four, with no second list to keep in step.

const ICONS: Record<NavIcon, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  dashboard: LayoutGrid,
  products: Package,
  categories: Tag,
  settings: SlidersHorizontal,
};

export function AppNav({ role, className }: { role: SessionRole; className?: string }) {
  const pathname = usePathname();
  const items = navForRole(role);

  if (items.length < 2) return null;

  return (
    <nav
      aria-label="Inventory sections"
      className={cn("hidden border-b border-border md:block", className)}
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = ICONS[item.icon];
          return (
            <li key={item.key} className="border-l border-border first:border-l-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.hint}
                className={cn(
                  "relative flex h-11 items-center gap-2 px-5 text-xs font-medium tracking-wide uppercase transition-colors focus-visible:outline-1 focus-visible:outline-ring",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.5} />
                {item.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
