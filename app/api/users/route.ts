import { NextResponse } from "next/server";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authenticate } from "@/lib/guard";

// Account creation. Administrator only (guide 10, Table 3.2).
//
// The password is hashed here with bcrypt at the same cost the seed uses
// (prisma/seed.ts), and the hash never leaves this handler. The response
// returns only the identity fields the accounts table renders.

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "A username needs at least 3 characters.")
    .max(40, "A username holds at most 40 characters.")
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, digits, dot, dash or underscore only."),
  password: z.string().min(8, "Set a password of at least 8 characters."),
  role: z.enum(["system_admin", "inventory_officer", "manager"], {
    message: "Choose a role.",
  }),
});

/** The Prisma error code on a thrown client error, if it carries one. */
function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code?: unknown }).code);
  }
  return undefined;
}

export async function POST(request: Request) {
  const auth = await authenticate("manage_users");
  if (auth.error) return auth.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const { username, password, role } = parsed.data;

  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json(
      { ok: false, error: `The username ${username} is already taken.` },
      { status: 409 },
    );
  }

  const password_hash = await bcrypt.hash(password, 10);

  try {
    const created = await db.user.create({
      data: { username, password_hash, role },
      select: { user_id: true, username: true, role: true, created_at: true },
    });
    return NextResponse.json({ ok: true, user: created }, { status: 201 });
  } catch (error) {
    if (errorCode(error) === "P2002") {
      return NextResponse.json(
        { ok: false, error: `The username ${username} is already taken.` },
        { status: 409 },
      );
    }
    throw error;
  }
}
