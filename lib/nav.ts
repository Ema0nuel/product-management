import type { SessionRole } from "@/lib/auth";

// Navigation spine. One source of truth for the desktop tab strip and the
// mobile tab bar; both render whatever navForRole() returns, so a new
// destination or a role change lands in one place and never drifts.
//
// Visibility follows the RBAC matrix (guide 10, thesis Table 3.2). The
// dashboard and the action records are read by every role; the manager's
// read-only sheet reaches both. The product and category registers are
// the inventory officer's daily work. Inventory Settings carries alert
// thresholds and account management, which only the administrator holds.
//
// Icons are named, not imported, so this module stays free of React and can
// be read by a server component without pulling the icon set into its graph.

export type NavIcon =
  | "dashboard"
  | "records"
  | "products"
  | "categories"
  | "settings";

export type NavItem = {
  key: string;
  href: string;
  /** Full label, used on the desktop strip. */
  label: string;
  /** Compact label, used on the mobile bar where width is scarce. */
  short: string;
  /** What the destination holds, read by screen readers on the tab. */
  hint: string;
  icon: NavIcon;
  roles: readonly SessionRole[];
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    key: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    short: "Dashboard",
    hint: "Expiry-priority batch ledger",
    icon: "dashboard",
    roles: ["system_admin", "inventory_officer", "manager"],
  },
  {
    key: "records",
    href: "/records",
    label: "Action Records",
    short: "Records",
    hint: "Recorded dispositions, read-only",
    icon: "records",
    roles: ["system_admin", "inventory_officer", "manager"],
  },
  {
    key: "products",
    href: "/products",
    label: "Products",
    short: "Products",
    hint: "Product register",
    icon: "products",
    roles: ["system_admin", "inventory_officer"],
  },
  {
    key: "categories",
    href: "/categories",
    label: "Categories",
    short: "Categories",
    hint: "Category register",
    icon: "categories",
    roles: ["system_admin", "inventory_officer"],
  },
  {
    key: "settings",
    href: "/settings",
    label: "Inventory Settings",
    short: "Settings",
    hint: "Alert thresholds and user accounts",
    icon: "settings",
    roles: ["system_admin"],
  },
];

/** The destinations a role may reach, in ledger order. */
export function navForRole(role: SessionRole | null | undefined): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** The destination a pathname belongs to, so a tab stays lit on child routes. */
export function navItemForPath(pathname: string | null | undefined): NavItem | undefined {
  if (!pathname) return undefined;
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}

/** True when the tab for this item is the current section. */
export function isNavItemActive(item: NavItem, pathname: string | null | undefined): boolean {
  return navItemForPath(pathname)?.key === item.key;
}
