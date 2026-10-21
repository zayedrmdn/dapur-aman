import { createHmac, timingSafeEqual } from "node:crypto";

export type User = { actor_id: string; name: string; username: string; role: "kitchen_staff" | "supervisor" };
export type Session = User & { expires: number };
export const SESSION_SECONDS = 8 * 60 * 60;

export function signSession(user: User, key: string, now = Date.now()): string {
  if (key.length < 32) throw new Error("Session signing is not configured.");
  const body = Buffer.from(JSON.stringify({ ...user, expires: Math.floor(now / 1000) + SESSION_SECONDS })).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}

export function verifySession(token: string | undefined, key: string, now = Date.now()): Session | null {
  if (!token || token.length > 2048 || key.length < 32) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra) return null;
  const expected = createHmac("sha256", key).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof data.actor_id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(data.actor_id) ||
        typeof data.name !== "string" || typeof data.username !== "string" ||
        !["kitchen_staff", "supervisor"].includes(data.role) ||
        !Number.isFinite(data.expires) || data.expires <= Math.floor(now / 1000) ||
        data.expires > Math.floor(now / 1000) + SESSION_SECONDS) return null;
    return data;
  } catch { return null; }
}
