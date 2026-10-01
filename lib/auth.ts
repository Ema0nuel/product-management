import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Session handling for the ledger app. Custom httpOnly cookie signed
// with HMAC-SHA256 over node:crypto, no external auth dependency.
// Roles match the seeded users table (PRODUCT.md, thesis 3.6).

export type SessionRole = "system_admin" | "inventory_officer" | "manager";

export type SessionUser = {
  userId: number;
  username: string;
  role: SessionRole;
};

const COOKIE_NAME = "session";
const MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) {
    throw new Error("SESSION_SECRET is not set. Add it to .env (openssl rand -hex 32).");
  }
  return s;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("hex");
}

export function createSessionToken(user: SessionUser): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = Buffer.from(JSON.stringify({ ...user, exp })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionUser & {
      exp: number;
    };
    if (typeof data.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: data.userId, username: data.username, role: data.role };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySessionToken(store.get(COOKIE_NAME)?.value);
}

export const sessionCookieName = COOKIE_NAME;
export const sessionMaxAgeSeconds = MAX_AGE_SECONDS;