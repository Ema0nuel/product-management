import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticate } from "@/lib/guard";
import { ProductStatus } from "@/lib/generated/prisma/client";

// Shelf state. In stock and on sale move both ways; disposed is terminal.
//
// The transition table is enforced here rather than in the form, because a
// form can be bypassed and the rule is a property of the record, not of the
// button that was pressed. A disposed product is struck off: it keeps its
// date and the account that struck it, and the route refuses to send it
// back to the shelf.

const idInput = z.coerce.number().int().positive();

const statusInput = z.object({
  status: z.enum(["IN_STOCK", "ON_SALE", "DISPOSED"]),
});

function prismaCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

const STATUS_LABEL: Record<ProductStatus, string> = {
  IN_STOCK: "in stock",
  ON_SALE: "on sale",
  DISPOSED: "disposed",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate("manage_products");
  if (auth.error) return auth.error;

  const { id } = await params;
  const parsedId = idInput.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ ok: false, error: "Unknown product." }, { status: 400 });
  }

  const parsed = statusInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const next = parsed.data.status as ProductStatus;

  const existing = await db.product.findUnique({
    where: { product_id: parsedId.data },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Unknown product." }, { status: 404 });
  }

  const current = existing.status as ProductStatus;

  // Terminal. Nothing, from any caller, returns a disposed product to the
  // shelf, and the refusal names what is being asked for.
  if (current === ProductStatus.DISPOSED && next !== ProductStatus.DISPOSED) {
    return NextResponse.json(
      {
        ok: false,
        error: "That product is already marked disposed and cannot return to the shelf.",
      },
      { status: 409 },
    );
  }

  const data =
    next === ProductStatus.DISPOSED
      ? {
          status: next,
          // The client never supplies who disposed of a product; the session
          // does, and the date is the server's own clock.
          disposed_at: existing.disposed_at ?? new Date(),
          disposed_by: auth.user.userId,
        }
      : { status: next };

  // No change to make: the product already sits where it was asked to sit.
  if (next === current && next !== ProductStatus.DISPOSED) {
    return NextResponse.json({ ok: true, product: existing });
  }

  try {
    const product = await db.product.update({
      where: { product_id: existing.product_id },
      data,
    });
    return NextResponse.json({ ok: true, product });
  } catch (error) {
    const code = prismaCode(error);
    if (code === "P2025") {
      return NextResponse.json({ ok: false, error: "Unknown product." }, { status: 404 });
    }
    throw error;
  }
}

/** Read the current state, for a caller that needs the label before acting. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate("manage_products");
  if (auth.error) return auth.error;

  const { id } = await params;
  const parsedId = idInput.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ ok: false, error: "Unknown product." }, { status: 400 });
  }

  const product = await db.product.findUnique({ where: { product_id: parsedId.data } });
  if (!product) {
    return NextResponse.json({ ok: false, error: "Unknown product." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    status: product.status,
    label: STATUS_LABEL[product.status as ProductStatus],
  });
}
