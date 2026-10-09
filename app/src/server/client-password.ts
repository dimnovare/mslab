import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { clients } from "@/db/schema";
import { normalizeEmail } from "@/domain/email";
import { passwordProblem, type PasswordProblem } from "@/domain/password";
import { underAddressLock } from "./client-auth";
import { hashPassword } from "./password";

// The optional client password (phase 2c, spec 7), set, changed and removed from Minu andmed (account-api.ts). The client is always the
// session's. Only the scrypt hash (server/password.ts) and the time of the last change ("muudetud {date}") are stored. The write
// itself runs under the client's address lock (client-auth.ts): a login that is checking the old hash finishes first, and one that
// starts after the change reads the new state, so a removed password cannot be let through by a check that began before.

export type SetPasswordResult =
  | { kind: "saved"; email: string; locale: "et" | "ru"; changedAt: Date }
  | { kind: "problem"; problem: PasswordProblem }
  | { kind: "gone" };

/** Sets or changes the client's password, checked against the rules with her address (domain/password.ts). "gone": no such client. */
export async function setClientPassword(db: Db, clientId: number, password: string, now: Date): Promise<SetPasswordResult> {
  const [client] = await db.select({ email: clients.email, locale: clients.locale }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return { kind: "gone" };
  const problem = passwordProblem(password, client.email);
  if (problem) return { kind: "problem", problem };
  const passwordHash = await hashPassword(password); // before the lock: the hash takes about 0.1 s, nobody should wait for it
  const saved = await underAddressLock(db, normalizeEmail(client.email), async (t) => {
    // (The cast: on the Db union, returning(fields) has no common overload.)
    const rows = await (t as PostgresJsDatabase<typeof schema>)
      .update(clients).set({ passwordHash, passwordChangedAt: now }).where(eq(clients.id, clientId)).returning({ id: clients.id });
    return rows.length > 0;
  });
  return saved ? { kind: "saved", email: client.email, locale: client.locale, changedAt: now } : { kind: "gone" };
}

/** Removes the client's password (the code works as always). `had`: there was one (only then is the change mailed). null: no such client. */
export async function removeClientPassword(db: Db, clientId: number): Promise<{ email: string; locale: "et" | "ru"; had: boolean } | null> {
  const [client] = await db.select({ email: clients.email, locale: clients.locale }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;
  return underAddressLock(db, normalizeEmail(client.email), async (t) => {
    // read under the lock: `had` is true for one of two removals sent together, and the hash cannot change between this and the write
    const [row] = await t.select({ hash: clients.passwordHash }).from(clients).where(eq(clients.id, clientId)).limit(1);
    if (!row) return null;
    if (row.hash !== null) await t.update(clients).set({ passwordHash: null, passwordChangedAt: null }).where(eq(clients.id, clientId));
    return { email: client.email, locale: client.locale, had: row.hash !== null };
  });
}
