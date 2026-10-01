import type { SessionRole } from "@/lib/auth";

// Role-based access control per Table 3.2 (guide 10). The client hides what
// a role cannot use; the server refuses it. Every page and route handler
// reads this matrix through can(), so the two boundaries cannot disagree.

export type Permission =
  | "view_dashboard"
  | "manage_products"
  | "manage_categories"
  | "manage_batches"
  | "record_action"
  | "configure_thresholds"
  | "manage_users";

const MATRIX: Record<SessionRole, readonly Permission[]> = {
  // The administrator runs the inventory and adds account management and
  // threshold configuration, and holds no power the workflow does not need.
  system_admin: [
    "view_dashboard",
    "manage_products",
    "manage_categories",
    "manage_batches",
    "record_action",
    "configure_thresholds",
    "manage_users",
  ],
  // The inventory officer does the daily work.
  inventory_officer: [
    "view_dashboard",
    "manage_products",
    "manage_categories",
    "manage_batches",
    "record_action",
  ],
  // The manager holds a read-only view of the dashboard and action records.
  manager: ["view_dashboard"],
};

export function can(role: SessionRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role].includes(permission);
}

export function canAny(
  role: SessionRole | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((p) => can(role, p));
}

export const ROLE_LABELS: Record<SessionRole, string> = {
  system_admin: "Administrator",
  inventory_officer: "Inventory Officer",
  manager: "Manager",
};

/** Display name for a role value read back from the database or a session. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return "Unknown";
  return ROLE_LABELS[role as SessionRole] ?? role;
}

export const ROLE_ORDER: readonly SessionRole[] = [
  "system_admin",
  "inventory_officer",
  "manager",
];
