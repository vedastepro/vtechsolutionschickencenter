import type { Context } from "hono";
import { getCookie } from "hono/cookie";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roles: string[];
  emailConfirmed: boolean;
}

// Short-lived cache of verified tokens. This is only a cache; the Identity API is the source of truth.
const cache = new Map<string, { user: AuthUser; until: number }>();

function readToken(c: Context): string | null {
  const header = c.req.header("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return getCookie(c, "nf_jwt") ?? null;
}

/**
 * Verifies the caller's Netlify Identity session by asking the Identity API who the token belongs to.
 * A forged or expired token is rejected by Identity, so the result can be trusted.
 */
export async function getAuthUser(c: Context): Promise<AuthUser | null> {
  const token = readToken(c);
  if (!token) return null;
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;

  const origin = new URL(c.req.url).origin;
  try {
    const res = await fetch(`${origin}/.netlify/identity/user`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (!data?.id || !data?.email) return null;
    const user: AuthUser = {
      id: data.id,
      email: String(data.email).toLowerCase(),
      name: data.user_metadata?.full_name ?? "",
      roles: Array.isArray(data.app_metadata?.roles) ? data.app_metadata.roles : [],
      emailConfirmed: Boolean(data.confirmed_at),
    };
    if (cache.size > 500) cache.clear();
    cache.set(token, { user, until: Date.now() + 60_000 });
    return user;
  } catch {
    return null;
  }
}

export const isAdmin = (u: AuthUser | null) => !!u && u.roles.includes("admin");
