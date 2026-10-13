import { ConvexError } from "convex/values";
import type { Auth, UserIdentity } from "convex/server";

/**
 * SER-13: server-side staff gate for every public Convex function.
 *
 * Identity comes only from `ctx.auth` (a token verified by a provider listed
 * in convex/auth.config.ts), never from a function argument. A caller is
 * staff when the provider vouches for their email (`emailVerified`) and that
 * email is in the comma-separated `STAFF_EMAILS` deployment env var.
 *
 * This deployment has no auth provider configured, so `getUserIdentity()`
 * is always null for browser/HTTP callers and every guarded function is
 * refused. Operators can still run functions with the deploy key, e.g.
 * `npx convex run clients:list --identity '{"email":"...","emailVerified":true}'`.
 */
export async function requireStaff(ctx: { auth: Auth }): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("UNAUTHENTICATED: sign in as Seridian staff");
  }
  const email = identity.email?.trim().toLowerCase();
  if (!email || identity.emailVerified !== true || !staffEmails().has(email)) {
    throw new ConvexError("FORBIDDEN: Seridian staff only");
  }
  return identity;
}

function staffEmails(): Set<string> {
  return new Set(
    (process.env.STAFF_EMAILS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}
