import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  createSessionToken,
  sessionCookieName,
  sessionMaxAgeSeconds,
  type SessionRole,
} from "@/lib/auth";

// Sign-in for employee or admin. Credentials are checked against the
// users table (bcrypt hash); a signed httpOnly cookie is set on success.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  if (!username || !password) {
    return NextResponse.json(
      { ok: false, error: "Enter your username and password." },
      { status: 400 },
    );
  }

  const user = await db.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return NextResponse.json(
      { ok: false, error: "Wrong username or password." },
      { status: 401 },
    );
  }

  const token = createSessionToken({
    userId: user.user_id,
    username: user.username,
    role: user.role as SessionRole,
  });

  const response = NextResponse.json({
    ok: true,
    user: { username: user.username, role: user.role },
  });
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  });
  return response;
}