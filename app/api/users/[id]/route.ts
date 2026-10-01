import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticate } from "@/lib/guard";

// Removing an account. Administrator only (guide 10).
//
// Two refusals matter here. An administrator cannot remove their own
// account: the interface hides the action, but the server has to refuse it
// too, or a crafted request locks the only administrator out of the sheet.
// And accounts.actions.user_id is ON DELETE RESTRICT, so an account that
// already filed action records cannot be erased, because the thesis
// requires every disposition to keep its attribution.

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticate("manage_users");
  if (auth.error) return auth.error;

  const { id } = await params;
  const userId = parseId(id);
  if (userId === null) {
    return NextResponse.json({ ok: false, error: "Unknown account." }, { status: 400 });
  }

  if (userId === auth.user.userId) {
    return NextResponse.json(
      { ok: false, error: "You cannot remove the account you are signed in with." },
      { status: 400 },
    );
  }

  const account = await db.user.findUnique({
    where: { user_id: userId },
    include: { _count: { select: { actions: true } } },
  });
  if (!account) {
    return NextResponse.json(
      { ok: false, error: "That account is not on file." },
      { status: 404 },
    );
  }

  if (account._count.actions > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `${account.username} has filed ${account._count.actions} action records. Those records keep their attribution, so the account cannot be removed.`,
      },
      { status: 409 },
    );
  }

  try {
    await db.user.delete({ where: { user_id: userId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : undefined;
    if (code === "P2003") {
      return NextResponse.json(
        {
          ok: false,
          error: `${account.username} is still referenced by action records, so the account cannot be removed.`,
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
