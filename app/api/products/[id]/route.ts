import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticate } from "@/lib/guard";

// Single-product API. PATCH edits the record; DELETE removes it, but only
// when it no longer holds batches. Both are the inventory officer's work and
// both answer with a plain sentence on refusal.
//
// PATCH never writes status, disposed_at or disposed_by. A disposal is only
// ever reached through the status route, so an edit cannot quietly bring a
// struck-off product back to the shelf.

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function calendarDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  // Midnight UTC, not midnight local: Prisma writes a @db.Date column from
  // the UTC components it is handed, so a local midnight east of UTC lands
  // one day early.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

const idInput = z.coerce.number().int().positive();

const productInput = z.object({
  name: z.string().trim().min(2, "Enter a product name of at least 2 characters."),
  category_id: z.coerce.number().int().positive("Choose a category."),
  description: z
    .string()
    .trim()
    .max(2000, "Keep the description within 2000 characters.")
    .optional()
    .transform((value) => (value ? value : null)),
  expiry_date: z
    .string()
    .trim()
    .min(1, "Enter the date this product expires.")
    .refine((value) => calendarDate(value) !== null, "Enter a real expiry date."),
  manufacturing_date: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null))
    .refine(
      (value) => value === null || calendarDate(value) !== null,
      "Enter a real manufacturing date.",
    ),
  storage_location: z
    .string()
    .trim()
    .max(120, "Keep the storage location within 120 characters.")
    .optional()
    .transform((value) => (value ? value : null)),
});

function prismaCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function serialize(product: {
  product_id: number;
  name: string;
  description: string | null;
  category_id: number;
  manufacturing_date: Date | null;
  expiry_date: Date | null;
  storage_location: string | null;
  status: string;
  disposed_at: Date | null;
  disposed_by: number | null;
}) {
  const iso = (value: Date | null) =>
    value ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}` : null;

  return {
    product_id: product.product_id,
    name: product.name,
    description: product.description,
    category_id: product.category_id,
    manufacturing_date: iso(product.manufacturing_date),
    expiry_date: iso(product.expiry_date),
    storage_location: product.storage_location,
    status: product.status,
    disposed_at: iso(product.disposed_at),
    disposed_by: product.disposed_by,
  };
}

export async function PATCH(
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

  const parsed = productInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const existing = await db.product.findUnique({ where: { product_id: parsedId.data } });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Unknown product." }, { status: 404 });
  }

  const values = parsed.data;
  const expiry = calendarDate(values.expiry_date);
  const manufacturing = values.manufacturing_date
    ? calendarDate(values.manufacturing_date)
    : null;
  if (!expiry) {
    return NextResponse.json(
      { ok: false, error: "Enter a real expiry date." },
      { status: 400 },
    );
  }
  if (manufacturing && manufacturing.getTime() > expiry.getTime()) {
    return NextResponse.json(
      { ok: false, error: "The manufacturing date must fall on or before the expiry date." },
      { status: 400 },
    );
  }

  const category = await db.category.findUnique({ where: { category_id: values.category_id } });
  if (!category) {
    return NextResponse.json(
      { ok: false, error: "That category no longer exists." },
      { status: 409 },
    );
  }

  const clash = await db.product.findFirst({
    where: {
      category_id: values.category_id,
      name: { equals: values.name, mode: "insensitive" },
      NOT: { product_id: existing.product_id },
    },
  });
  if (clash) {
    return NextResponse.json(
      { ok: false, error: `${values.name} is already on file in ${category.name}.` },
      { status: 409 },
    );
  }

  try {
    const product = await db.product.update({
      where: { product_id: existing.product_id },
      data: {
        name: values.name,
        category_id: values.category_id,
        description: values.description,
        manufacturing_date: manufacturing,
        expiry_date: expiry,
        storage_location: values.storage_location,
      },
    });
    return NextResponse.json({ ok: true, product: serialize(product) });
  } catch (error) {
    const code = prismaCode(error);
    if (code === "P2003") {
      return NextResponse.json(
        { ok: false, error: "That category no longer exists." },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function DELETE(
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

  const existing = await db.product.findUnique({
    where: { product_id: parsedId.data },
    include: { _count: { select: { batches: true } } },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Unknown product." }, { status: 404 });
  }

  if (existing._count.batches > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `That product still holds ${existing._count.batches} batches. Record dispositions before removing it.`,
      },
      { status: 409 },
    );
  }

  try {
    await db.product.delete({ where: { product_id: existing.product_id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (prismaCode(error) === "P2003") {
      return NextResponse.json(
        { ok: false, error: "That product still holds records. Clear them before removing it." },
        { status: 409 },
      );
    }
    throw error;
  }
}
