import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/rbac";

// Server-side guards. Every protected page and route handler starts here so
// role boundaries are enforced before the data layer is touched (guide 10,
// PRODUCT.md principle 5: the client never decides who may act).
//
// Pages bounce; route handlers answer with a status. Same matrix, two
// shapes, because a redirect is meaningless to a fetch() caller.

/** The signed-in user, or a bounce to the sign-in sheet. Pages only. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return user;
}

/**
 * The signed-in user when they hold the permission, otherwise a bounce to
 * the dashboard. A manager reaching /products by URL lands on the ledger
 * rather than an error page: the sheet they are allowed to read.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/dashboard");
  return user;
}

export type ApiAuth =
  | { user: SessionUser; error: null }
  | { user: null; error: NextResponse };

/**
 * Route-handler guard. Returns the user on success, or a ready-made 401/403
 * JSON response. Usage:
 *
 *   const auth = await authenticate("manage_products");
 *   if (auth.error) return auth.error;
 *   // auth.user is the signed-in officer or administrator
 */
export async function authenticate(permission: Permission): Promise<ApiAuth> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 }),
    };
  }
  if (!can(user.role, permission)) {
    return {
      user: null,
      error: NextResponse.json(
        { ok: false, error: "Your role cannot perform this action." },
        { status: 403 },
      ),
    };
  }
  return { user, error: null };
}
