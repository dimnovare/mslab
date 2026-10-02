import { describe, expect, test } from "vitest";
import { keepNamesTogether } from "@/lib/typography";

describe("keepNamesTogether (popup title, round 2 item 8)", () => {
  test("two Title-case Latin words stay together; all-caps words and other text wrap as before", () => {
    expect(keepNamesTogether("−15% Lash Lift BOTOX koolitusele")).toBe("−15% Lash Lift BOTOX koolitusele");
    expect(keepNamesTogether("−15% на курс Lash Lift BOTOX")).toBe("−15% на курс Lash Lift BOTOX");
    expect(keepNamesTogether("Brow Lamination Pro Course")).toBe("Brow Lamination Pro Course");
    expect(keepNamesTogether("MS LAB Koolituskeskus")).toBe("MS LAB Koolituskeskus");
    expect(keepNamesTogether("Talvine pakkumine")).toBe("Talvine pakkumine");
    expect(keepNamesTogether("Мария Соснина")).toBe("Мария Соснина"); // Cyrillic names wrap as any text
  });
});
