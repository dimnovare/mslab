import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from "vitest";
import { MAX_IMAGE_BYTES, UploadError } from "@/server/media";
import { fakeMediaStore } from "../fakes";

// POST /api/admin/lesson-file. The store comes from mediaStore() (replaced by an in-memory fake, or null: production without
// R2), the database from getDb() (a stand-in) and addLessonFile (the checks and the rows: tests/db/lesson-files.test.ts) is
// recorded here: this file is about what the route does with the request and with each answer. The admin check is withAdmin's
// own (admin-guards.test.ts, tests/db/auth.test.ts); here it lets the request through.

const mocks = vi.hoisted(() => ({ store: null as unknown, addLessonFile: vi.fn() }));
vi.mock("@/server/media-store", () => ({ mediaStore: () => mocks.store }));
vi.mock("@/db/client", () => ({ getDb: () => "the-db" }));
vi.mock("@/server/lesson-files", () => ({ addLessonFile: mocks.addLessonFile }));
vi.mock("@/server/auth", () => ({
  withAdmin: (handler: (request: Request, ctx: unknown, admin: { email: string }) => Response | Promise<Response>) => (request: Request, ctx: unknown) => handler(request, ctx, { email: "admin@example.test" }),
}));

import * as route from "@/app/api/admin/lesson-file/route";

const { POST } = route;

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2];
const pdf = () => new File([new Uint8Array(PDF)], "Juhend.pdf", { type: "application/pdf" });
const post = (fields: Record<string, string | File | undefined>, headers: Record<string, string> = {}) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) if (value !== undefined) body.set(name, value);
  return POST(new Request("https://mslab.example/api/admin/lesson-file", { method: "POST", body, headers }), undefined);
};

let log: MockInstance<typeof console.error>;
beforeEach(() => {
  mocks.store = fakeMediaStore();
  mocks.addLessonFile.mockReset();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/lesson-file", () => {
  test("201 with the stored file; the lesson id, the store and the file go to addLessonFile; never cached", async () => {
    const stored = { id: 7, name: "Juhend.pdf", size: PDF.length, contentType: "application/pdf" };
    mocks.addLessonFile.mockResolvedValue(stored);
    const res = await post({ lessonId: "12", file: pdf() });
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, file: stored });
    expect(mocks.addLessonFile).toHaveBeenCalledTimes(1);
    const [db, store, lessonId, file] = mocks.addLessonFile.mock.calls[0];
    expect([db, store, lessonId]).toEqual(["the-db", mocks.store, 12]);
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("Juhend.pdf");
  });

  test("400 `missing` without a file or without a usable lesson id; nothing is asked of the store or the database", async () => {
    const cases: Record<string, string | File | undefined>[] = [
      { lessonId: "1" },
      { file: pdf() },
      { lessonId: "", file: pdf() },
      { lessonId: "abc", file: pdf() },
      { lessonId: "0", file: pdf() },
      { lessonId: "-3", file: pdf() },
      { lessonId: "1.5", file: pdf() },
      { lessonId: "2147483648", file: pdf() }, // over an integer column's range: a database error, not a 404
      // lib/row-id.ts parseRowId: what Number() would have taken is not an id
      { lessonId: "1e3", file: pdf() },
      { lessonId: "0x10", file: pdf() },
      { lessonId: " 7", file: pdf() },
      { lessonId: "007", file: pdf() },
      { lessonId: "1", file: "just text, not a file" },
    ];
    for (const fields of cases) {
      const res = await post(fields);
      expect(res.status, JSON.stringify({ lessonId: fields.lessonId ?? null, file: fields.file instanceof File ? "File" : (fields.file ?? null) })).toBe(400);
      expect(await res.json()).toEqual({ ok: false, error: "missing" });
    }
    expect(mocks.addLessonFile).not.toHaveBeenCalled();
  });

  test("a body that is not multipart is 400 `missing`, not a 500", async () => {
    const res = await POST(new Request("https://mslab.example/api/admin/lesson-file", { method: "POST", body: "lessonId=1", headers: { "content-type": "application/x-www-form-urlencoded" } }), undefined);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "missing" });
  });

  test("404 `notFound` for a lesson that is not there", async () => {
    mocks.addLessonFile.mockResolvedValue("notFound");
    const res = await post({ lessonId: "999", file: pdf() });
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: false, error: "notFound" });
  });

  test("the refusals keep their statuses: size 413, type 415, content 415, empty 400", async () => {
    const cases: [UploadError["reason"], number][] = [["size", 413], ["type", 415], ["content", 415], ["empty", 400]];
    for (const [reason, status] of cases) {
      mocks.addLessonFile.mockRejectedValueOnce(new UploadError(reason));
      const res = await post({ lessonId: "1", file: pdf() });
      expect(res.status, reason).toBe(status);
      expect(await res.json(), reason).toEqual({ ok: false, error: reason });
    }
    expect(log).not.toHaveBeenCalled(); // a refused file is not a failure
  });

  test("a request announced as larger than the limit plus the multipart envelope is 413 before its body is read", async () => {
    const body = new FormData();
    body.set("lessonId", "1");
    body.set("file", pdf());
    const request = new Request("https://mslab.example/api/admin/lesson-file", { method: "POST", body, headers: { "content-length": String(MAX_IMAGE_BYTES + 128 * 1024) } });
    const formData = vi.spyOn(request, "formData");
    const res = await POST(request, undefined);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ ok: false, error: "size" });
    expect(formData).not.toHaveBeenCalled();
    expect(mocks.addLessonFile).not.toHaveBeenCalled();
  });

  test("no file store (production without R2): 503 `storage`, and the log says why", async () => {
    mocks.store = null;
    const res = await post({ lessonId: "1", file: pdf() });
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: false, error: "storage" });
    expect(mocks.addLessonFile).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain("R2_");
  });

  test("a store or database that fails: 500 `server`, logged without the message", async () => {
    mocks.addLessonFile.mockRejectedValue(new Error("store says: secret detail"));
    const res = await post({ lessonId: "1", file: pdf() });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "server" });
    expect(log.mock.calls.map((c) => c.join(" "))).toEqual(["[admin] lesson file upload failed: Error"]);
  });
});
