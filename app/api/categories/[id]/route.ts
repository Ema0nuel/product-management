import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticate } from "@/lib/guard";

// One category in the register: rename it, or remove it when empty.
//
// products.category_id is ON DELETE RESTRICT, so a category that still
// holds products is refused here with a sentence naming the count. The
// register never cascades a delete into stock records (guide 6.3).

const updateSchema = z.object({
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

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate("manage_categories");
  if (auth.error) return auth.error;

  const { id } = await params;
  const categoryId = parseId(id);
  if (categoryId === null) {
    return NextResponse.json({ ok: false, error: "Unknown category." }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const name = parsed.data.name;

  const current = await db.category.findUnique({ where: { category_id: categoryId } });
  if (!current) {
    return NextResponse.json(
      { ok: false, error: "That category is not on file." },
      { status: 404 },
    );
  }

  const clash = await db.category.findFirst({
    where: { name, NOT: { category_id: categoryId } },
  });
  if (clash) {
    return NextResponse.json(
      { ok: false, error: `A category named ${name} already exists.` },
      { status: 409 },
    );
  }

  try {
    const category = await db.category.update({
      where: { category_id: categoryId },
      data: { name },
    });
    return NextResponse.json({ ok: true, category });
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

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate("manage_categories");
  if (auth.error) return auth.error;

  const { id } = await params;
  const categoryId = parseId(id);
  if (categoryId === null) {
    return NextResponse.json({ ok: false, error: "Unknown category." }, { status: 400 });
  }

  const category = await db.category.findUnique({
    where: { category_id: categoryId },
    include: { _count: { select: { products: true } } },
  });
  if (!category) {
    return NextResponse.json(
      { ok: false, error: "That category is not on file." },
      { status: 404 },
    );
  }

  const held = category._count.products;
  if (held > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `That category still holds ${held} product${held === 1 ? "" : "s"}. Remove or refile them first.`,
      },
      { status: 409 },
    );
  }

  try {
    await db.category.delete({ where: { category_id: categoryId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (errorCode(error) === "P2003") {
      return NextResponse.json(
        { ok: false, error: `${category.name} still holds products. Remove or refile them first.` },
        { status: 409 },
      );
    }
    throw error;
  }
}
