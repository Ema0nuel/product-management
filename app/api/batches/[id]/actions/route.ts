import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticate } from "@/lib/guard";
import { DISPOSITIONS } from "@/lib/actions";

// Action recording per thesis 3.5.2 (algorithm PrioritiseAndRecordAction):
// the officer picks a batch and a disposition from the fixed set, and the
// record is stored with the identity of the user and the time of
// recording. The client supplies the disposition and an optional remark;
// identity and time come from the session and the server clock, so a
// record can never claim an author or a moment it was not given.
//
// Current disposition is not written anywhere. It derives from the most
// recent action at read time (PRODUCT.md, thesis 3.6.8), so this route
// only ever appends to the record.

const idInput = z.coerce.number().int().positive();

const recordInput = z.object({
  disposition: z.enum(DISPOSITIONS),
  remark: z
    .string()
    .trim()
    .max(500, "Keep the remark to 500 characters.")
    .optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate("record_action");
  if (auth.error) return auth.error;

  const { id } = await params;
  const parsedId = idInput.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ ok: false, error: "Unknown batch." }, { status: 400 });
  }

  const parsed = recordInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const batch = await db.batch.findUnique({ where: { batch_id: parsedId.data } });
  if (!batch) {
    return NextResponse.json({ ok: false, error: "Unknown batch." }, { status: 404 });
  }

  try {
    const action = await db.action.create({
      data: {
        batch_id: batch.batch_id,
        user_id: auth.user.userId,
        disposition: parsed.data.disposition,
        // An empty remark is no remark; the column stays null rather than
        // holding an empty string.
        remark: parsed.data.remark || null,
      },
      include: { user: { select: { username: true } } },
    });
    return NextResponse.json({ ok: true, action });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      // The batch or the session user vanished between the checks above and
      // the write. Both are refusals, not crashes.
      if ((error as { code?: unknown }).code === "P2003") {
        return NextResponse.json(
          { ok: false, error: "That batch is no longer on file." },
          { status: 404 },
        );
      }
    }
    throw error;
  }
}

/** The action records held against one batch, newest first. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate("view_dashboard");
  if (auth.error) return auth.error;

  const { id } = await params;
  const parsedId = idInput.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ ok: false, error: "Unknown batch." }, { status: 400 });
  }

  const batch = await db.batch.findUnique({ where: { batch_id: parsedId.data } });
  if (!batch) {
    return NextResponse.json({ ok: false, error: "Unknown batch." }, { status: 404 });
  }

  const actions = await db.action.findMany({
    where: { batch_id: batch.batch_id },
    orderBy: { created_at: "desc" },
    include: { user: { select: { username: true } } },
  });

  return NextResponse.json({ ok: true, actions });
}
