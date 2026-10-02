import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "@/db/client";
import { makeTestDb } from "./helpers";

// The signed-in admin is looked up once per Worker request (worker.ts runs each request in its own scope), never
// handed from one request to the next, also when React's cache() can no longer tell requests apart
// (../lost-react-request.ts: a Worker isolate after a CPU-limit kill in the middle of a render).

vi.mock("react", async (original) => (await import("../lost-react-request")).lostReactRequest(original));
const state = vi.hoisted(() => ({ db: null as unknown, cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "__Host-mslab_admin" && state.cookie ? { name, value: state.cookie } : undefined) }) }));
vi.mock("@/db/client", () => ({ getDb: () => state.db }));
vi.stubEnv("ADMIN_EMAILS", "admin@example.test,second.admin@example.com"); // the sign-in allow-list: server/env.ts reads process.env

import { createSession, currentAdminEmail } from "@/server/auth";
import { runAsRequest } from "@/worker/request-context";

let db: Db;
beforeAll(async () => {
  db = await makeTestDb();
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  state.db = db;
  state.cookie = undefined;
});

describe("currentAdminEmail", () => {
  test("a visitor without a session is never given the admin of an earlier request", async () => {
    state.cookie = await createSession(db, "admin@example.test");
    expect(await runAsRequest(1, () => currentAdminEmail())).toBe("admin@example.test");
    state.cookie = undefined;
    expect(await runAsRequest(2, () => currentAdminEmail())).toBeNull();
    state.cookie = "A".repeat(43); // the shape of a session id, but no such session
    expect(await runAsRequest(3, () => currentAdminEmail())).toBeNull();
  });

  test("each admin is looked up in their own request; within one request the lookup is shared", async () => {
    const first = await createSession(db, "admin@example.test");
    const second = await createSession(db, "second.admin@example.com");
    state.cookie = first;
    const [a, again] = await runAsRequest(1, async () => {
      const a = await currentAdminEmail();
      state.cookie = second; // the same request: the memoised lookup stands
      return [a, await currentAdminEmail()];
    });
    expect([a, again]).toEqual(["admin@example.test", "admin@example.test"]);
    expect(await runAsRequest(2, () => currentAdminEmail())).toBe("second.admin@example.com");
  });
});
