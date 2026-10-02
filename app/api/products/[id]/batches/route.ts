import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticate } from "@/lib/guard";
import { classifyLevel, daysUntil } from "@/lib/expiry";
import type { AlertLevel } from "@/lib/generated/prisma/client";

// Batch registration (thesis 3.4.2): the officer files one or more stock
// lots against a product, each carrying a batch number, quantity,
// manufacturing date, expiry date and shelf position. The classification
// engine runs on registration of a batch (thesis 3.4.3), so the level is
// written here as well as derived at read time elsewhere.
//
// The product sits in the path rather than the body, so a caller cannot
// file stock against a product it did not name. Storage location is
// required because the column is: an unlocated lot is not on any shelf.

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

const batchInput = z.object({
  batch_number: z
    .string()
    .trim()
    .min(1, "Enter a batch number.")
    .max(60, "Keep the batch number within 60 characters."),
  quantity: z.coerce
    .number()
    .int("Enter a whole number of units.")
    .positive("Quantity must be at least 1.")
    .max(2147483647, "Quantity is too large to record."),
  manufacturing_date: z
    .string()
    .trim()
    .min(1, "Enter the date this batch was made.")
    .refine((value) => calendarDate(value) !== null, "Enter a real manufacturing date."),
  expiry_date: z
    .string()
    .trim()
    .min(1, "Enter the date this batch expires.")
    .refine((value) => calendarDate(value) !== null, "Enter a real expiry date."),
  storage_location: z
    .string()
    .trim()
    .min(1, "Enter where this batch is stored.")
    .max(120, "Keep the storage location within 120 characters."),
});

function prismaCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function serialize(batch: {
  batch_id: number;
  product_id: number;
  batch_number: string;
  quantity: number;
  manufacturing_date: Date;
  expiry_date: Date;
  storage_location: string;
  alert_level: AlertLevel;
}) {
  const iso = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

  return {
    batch_id: batch.batch_id,
    product_id: batch.product_id,
    batch_number: batch.batch_number,
    quantity: batch.quantity,
    manufacturing_date: iso(batch.manufacturing_date),
    expiry_date: iso(batch.expiry_date),
    storage_location: batch.storage_location,
    alert_level: batch.alert_level,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate("manage_batches");
  if (auth.error) return auth.error;

  const { id } = await params;
  const parsedId = idInput.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ ok: false, error: "Unknown product." }, { status: 400 });
  }

  const parsed = batchInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const values = parsed.data;

  const manufacturing = calendarDate(values.manufacturing_date);
  const expiry = calendarDate(values.expiry_date);
  if (!manufacturing || !expiry) {
    return NextResponse.json(
      { ok: false, error: "Enter a real manufacturing date and expiry date." },
      { status: 400 },
    );
  }
  if (manufacturing.getTime() > expiry.getTime()) {
    return NextResponse.json(
      {
        ok: false,
        error: "The manufacturing date must fall on or before the expiry date.",
      },
      { status: 400 },
    );
  }

  const product = await db.product.findUnique({
    where: { product_id: parsedId.data },
  });
  if (!product) {
    return NextResponse.json({ ok: false, error: "Unknown product." }, { status: 404 });
  }
  if (product.status === "DISPOSED") {
    return NextResponse.json(
      { ok: false, error: "That product is marked disposed and takes no new batches." },
      { status: 409 },
    );
  }

  // One batch number per product, case-insensitive: the number is how the
  // officer tells two lots apart on the ledger, so a repeat would leave the
  // row ambiguous. The rule lives here rather than in the form because the
  // database holds no unique index on it.
  const clash = await db.batch.findFirst({
    where: {
      product_id: product.product_id,
      batch_number: { equals: values.batch_number, mode: "insensitive" },
    },
  });
  if (clash) {
    return NextResponse.json(
      { ok: false, error: `${values.batch_number} is already on file against this product.` },
      { status: 409 },
    );
  }

  const settings = await db.appSettings.findUnique({ where: { id: 1 } });
  const warningMax = settings?.warning_max ?? 30;
  const criticalMax = settings?.critical_max ?? 7;

  // Classify against the calendar date as the read path sees it: local
  // midnight, because node-postgres reads a DATE column back that way. The
  // UTC-built `expiry` above is what gets stored; this is only the level
  // written on registration.
  const [year, month, day] = values.expiry_date.split("-").map(Number);
  const level: AlertLevel = classifyLevel(
    daysUntil(new Date(year, month - 1, day)),
    warningMax,
    criticalMax,
  );

  try {
    const batch = await db.batch.create({
      data: {
        product_id: product.product_id,
        batch_number: values.batch_number,
        quantity: values.quantity,
        manufacturing_date: manufacturing,
        expiry_date: expiry,
        storage_location: values.storage_location,
        alert_level: level,
      },
    });
    return NextResponse.json({ ok: true, batch: serialize(batch) }, { status: 201 });
  } catch (error) {
    if (prismaCode(error) === "P2003") {
      return NextResponse.json(
        { ok: false, error: "That product no longer exists." },
        { status: 409 },
      );
    }
    throw error;
  }
}
