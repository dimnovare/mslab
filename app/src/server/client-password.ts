import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { clients } from "@/db/schema";
import { passwordProblem, type PasswordProblem } from "@/domain/password";
import { hashPassword } from "./password";

// The optional client password (phase 2c, spec 7), set, changed and removed from Minu andmed (account-api.ts). The client is always the
// session's. Only the scrypt hash (server/password.ts) and the time of the last change ("muudetud {date}") are stored.

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
  const passwordHash = await hashPassword(password);
  const rows = await db.update(clients).set({ passwordHash, passwordChangedAt: now }).where(eq(clients.id, clientId)).returning();
  return rows.length ? { kind: "saved", email: client.email, locale: client.locale, changedAt: now } : { kind: "gone" };
}

/** Removes the client's password (the code works as always). `had`: there was one (only then is the change mailed). null: no such client. */
export async function removeClientPassword(db: Db, clientId: number): Promise<{ email: string; locale: "et" | "ru"; had: boolean } | null> {
  const [client] = await db.select({ email: clients.email, locale: clients.locale, hash: clients.passwordHash }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return null;
  if (client.hash !== null) await db.update(clients).set({ passwordHash: null, passwordChangedAt: null }).where(eq(clients.id, clientId));
  return { email: client.email, locale: client.locale, had: client.hash !== null };
}
