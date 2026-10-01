import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticate } from "@/lib/guard";

// Category register collection endpoint. GET feeds any signed-in reader
// (the dashboard counts, the category table); POST is the first write in
// the goods-inward flow, because a product cannot be filed without a
// category to hold it (guide 6.3).
//
// categories.name carries a unique index, so a duplicate is answered
// plainly rather than surfacing a raw database fault.

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "A category name needs at least 2 characters.")
    .max(60, "A category name holds at most 60 characters."),
});

/** The Prisma error code on a thrown client error, if it carries one. */
function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code?: unknown }).code);
  }
  return undefined;
}

export async function GET() {
  const auth = await authenticate("view_dashboard");
  if (auth.error) return auth.error;

  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return NextResponse.json({ ok: true, categories });
}

export async function POST(req: Request) {
  const auth = await authenticate("manage_categories");
  if (auth.error) return auth.error;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const name = parsed.data.name;

  const existing = await db.category.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json(
      { ok: false, error: `A category named ${name} already exists.` },
      { status: 409 },
    );
  }

  try {
    const category = await db.category.create({ data: { name } });
    return NextResponse.json({ ok: true, category }, { status: 201 });
  } catch (error) {
    if (errorCode(error) === "P2002") {
      return NextResponse.json(
        { ok: false, error: `A category named ${name} already exists.` },
        { status: 409 },
      );
    }
    throw error;
  }
}
