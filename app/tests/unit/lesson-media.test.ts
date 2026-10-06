import { expect, test, vi } from "vitest";
import { BunnyError, type BunnyApi } from "@/server/bunny";
import { removeLessonMedia } from "@/server/lesson-media";
import { fakeMediaStore } from "../fakes";

test("a deleted lesson's videos leave Bunny and its files the store; a failure is logged without ids and the rest goes on", async () => {
  const gone: string[] = [];
  const bunny: BunnyApi = {
    createVideo: vi.fn(),
    getVideo: vi.fn(),
    deleteVideo: vi.fn(async (id: string) => {
      if (id === "bad-video") throw new BunnyError("delete", 500);
      gone.push(id);
    }),
  };
  const files = fakeMediaStore({ "lessons/a.pdf": { bytes: [1] } });
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await removeLessonMedia({ videoIds: ["bad-video", "v2"], fileKeys: ["lessons/a.pdf"] }, { bunny, files });
  expect(gone).toEqual(["v2"]);
  expect(files.deleted).toEqual(["lessons/a.pdf"]);
  expect(error).toHaveBeenCalledWith("[lesson] video not deleted: BunnyError (status 500)");
  expect(JSON.stringify(error.mock.calls)).not.toContain("bad-video");
  error.mockRestore();
});

test("without Bunny or a store nothing is tried, and nothing throws", async () => {
  await expect(removeLessonMedia({ videoIds: ["v"], fileKeys: ["k"] }, { bunny: null, files: null })).resolves.toBeUndefined();
});
