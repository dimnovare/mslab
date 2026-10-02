import { describe, expect, test } from "vitest";
import { afterReload, afterSave, dirtyParts, type Loaded } from "@/components/admin/site-draft";

// Task 13B fix round: how a site editor's draft follows a save and a reload (useSiteDraft).

type V = { slides: { title: string }[]; statement: { body: string }; faq: string[] };
const base: Loaded<V> = { values: { slides: [{ title: "A" }], statement: { body: "Lause" }, faq: ["K1"] }, versions: { slides: "v1", statement: "s1", faq: "f1" } };

describe("afterSave", () => {
  test("a sent part that was not touched meanwhile takes the stored (normalised) value; base and version advance", () => {
    const sent = { statement: { body: "Uus lause  " } };
    const draft = { ...base.values, statement: { body: "Uus lause  " } };
    const r = afterSave(draft, base, sent, { values: { statement: { body: "Uus lause" } }, versions: { statement: "s2" } });
    expect(r.draft.statement).toEqual({ body: "Uus lause" });
    expect(r.base.values.statement).toEqual({ body: "Uus lause" });
    expect(r.base.versions).toEqual({ slides: "v1", statement: "s2", faq: "f1" });
    expect(dirtyParts(r.draft, r.base)).toEqual([]);
  });

  test("text typed while the save was on its way is kept, and the part stays unsaved with the new version", () => {
    const sent = { statement: { body: "Uus lause" } };
    const draft = { ...base.values, statement: { body: "Uus lause, veel pikem" } }; // typed during the round trip
    const r = afterSave(draft, base, sent, { values: { statement: { body: "Uus lause" } }, versions: { statement: "s2" } });
    expect(r.draft.statement).toEqual({ body: "Uus lause, veel pikem" });
    expect(r.base.values.statement).toEqual({ body: "Uus lause" });
    expect(r.base.versions.statement).toBe("s2"); // the next save of it is not stale
    expect(dirtyParts(r.draft, r.base)).toEqual(["statement"]);
  });

  test("an upload that finished during the save is kept (the list grew after it was sent)", () => {
    const sent = { slides: [{ title: "A" }, { title: "B" }] };
    const draft = { ...base.values, slides: [{ title: "A" }, { title: "B" }, { title: "uploaded" }] };
    const r = afterSave(draft, base, sent, { values: { slides: [{ title: "A" }, { title: "B" }] }, versions: { slides: "v2" } });
    expect(r.draft.slides).toEqual([{ title: "A" }, { title: "B" }, { title: "uploaded" }]);
    expect(r.base.versions.slides).toBe("v2");
    expect(dirtyParts(r.draft, r.base)).toEqual(["slides"]);
  });

  test("parts that were not sent are left alone", () => {
    const draft = { ...base.values, faq: ["K1", "K2 (unsaved)"] };
    const r = afterSave(draft, base, { statement: { body: "X" } }, { values: { statement: { body: "X" } }, versions: { statement: "s2" } });
    expect(r.draft.faq).toEqual(["K1", "K2 (unsaved)"]);
    expect(r.base.values.faq).toEqual(["K1"]);
    expect(r.base.versions.faq).toBe("f1");
  });
});

describe("afterReload", () => {
  test("a part stored with a newer version follows it when it has no unsaved changes", () => {
    const initial: Loaded<V> = { values: { ...base.values, faq: ["K1", "K9"] }, versions: { ...base.versions, faq: "f2" } };
    const r = afterReload(base.values, base, initial);
    expect(r.draft.faq).toEqual(["K1", "K9"]);
    expect(r.base.versions.faq).toBe("f2");
  });

  test("a part with unsaved changes keeps the draft and the version it was loaded at (its save will be stale)", () => {
    const draft = { ...base.values, faq: ["K1", "mine"] };
    const initial: Loaded<V> = { values: { ...base.values, faq: ["K1", "theirs"] }, versions: { ...base.versions, faq: "f2" } };
    const r = afterReload(draft, base, initial);
    expect(r.draft.faq).toEqual(["K1", "mine"]);
    expect(r.base.versions.faq).toBe("f1");
    expect(r.base.values.faq).toEqual(["K1"]);
  });

  test("the same versions change nothing", () => {
    const draft = { ...base.values, statement: { body: "typing" } };
    expect(afterReload(draft, base, { values: base.values, versions: { ...base.versions } })).toEqual({ draft, base });
  });

  test("save + reload in the same render: the save's merge first, then the reload finds nothing newer", () => {
    const sent = { statement: { body: "Uus" } };
    const draft = { ...base.values, statement: { body: "Uus, edasi" } };
    const saved = { values: { statement: { body: "Uus" } }, versions: { statement: "s2" } };
    const merged = afterSave(draft, base, sent, saved);
    const r = afterReload(merged.draft, merged.base, { values: { ...base.values, statement: { body: "Uus" } }, versions: { ...base.versions, statement: "s2" } });
    expect(r.draft.statement).toEqual({ body: "Uus, edasi" });
    expect(r.base.versions.statement).toBe("s2");
  });
});
