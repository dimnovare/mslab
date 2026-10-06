// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { UnlockNextLesson } from "@/components/admin/ClientForms";
import { adminEt } from "@/i18n/dict/admin";

// "Ava järgmine õppetund" in a student's drawer, in a browser-like document (happy-dom) with the server action answered here: the
// confirming step, the line that says what was opened (kept when the page comes back with nothing left to open), a step that
// does not come back by itself, and a failed answer.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const action = vi.hoisted(() => vi.fn<(prev: unknown, formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>>());
vi.mock("@/server/actions/admin-clients", () => ({
  addStudent: vi.fn(),
  grantCourseAccess: vi.fn(),
  revokeCourseAccess: vi.fn(),
  unlockNextLesson: action,
}));

const t = { ...adminEt.clients.unlock, saving: adminEt.common.saving, error: adminEt.common.saveError };
const third = { id: 7, title: "Kolmas tund" };
const fourth = { id: 8, title: "Neljas tund" };

let container: HTMLDivElement;
let root: Root;
const $ = <E extends Element = HTMLElement>(selector: string) => document.querySelector<E>(selector);
const settle = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  });
/** The drawer's page: the component with the lesson the page says is locked now (null: none). */
const show = async (lesson: { id: number; title: string } | null) => {
  await act(async () => root.render(createElement(UnlockNextLesson, { clientId: 3, courseId: 5, lesson, t })));
  await settle();
};
const click = async (el: Element | null) => {
  expect(el, "the element to click").not.toBeNull();
  await act(async () => (el as HTMLElement).click());
  await settle();
};
const button = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent === name) ?? null;
const submit = async () => {
  await act(async () => $<HTMLFormElement>("[data-unlock-confirm]")!.requestSubmit());
  await settle();
};
const doneLine = () => $("[data-unlock-done]");

beforeEach(() => {
  action.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("UnlockNextLesson", () => {
  test("one button; its step asks about the lesson and sends the three ids; \"Ei\" goes back with the focus on the button", async () => {
    await show(third);
    expect(button("Ava järgmine õppetund")).not.toBeNull();
    expect($("[data-unlock-confirm]")).toBeNull();
    await click(button("Ava järgmine õppetund"));
    expect($("[data-unlock-confirm] p")!.textContent).toBe("Kas avan õpilasele õppetunni „Kolmas tund“? Ta saab selle kohe vaadata.");
    expect(document.activeElement).toBe($("[data-unlock-confirm] p"));
    expect([...document.querySelectorAll<HTMLInputElement>("[data-unlock-confirm] input")].map((i) => [i.name, i.value])).toEqual([["clientId", "3"], ["courseId", "5"], ["lessonId", "7"]]);
    await click(button("Ei"));
    expect($("[data-unlock-confirm]")).toBeNull();
    expect(action).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });
    expect(document.activeElement).toBe(button("Ava järgmine õppetund"));
  });

  test("an open step ends when the page comes back with nothing locked, and does not come back asking by itself when a lesson is locked again", async () => {
    await show(third);
    await click(button("Ava järgmine õppetund"));
    expect($("[data-unlock-confirm]")).not.toBeNull();
    await show(null); // opened elsewhere, or hidden: nothing to open
    expect($("[data-unlock-confirm]")).toBeNull();
    expect(button("Ava järgmine õppetund")).toBeNull();
    await show(fourth); // a lesson is locked again: the button, not the question
    expect($("[data-unlock-confirm]")).toBeNull();
    expect(button("Ava järgmine õppetund")).not.toBeNull();
  });

  test("ok: the line says which lesson was opened and keeps saying it when the page comes back with nothing locked; the focus is on it", async () => {
    action.mockResolvedValue({ ok: true });
    await show(third);
    expect(doneLine()!.textContent).toBe(""); // a status region from the start (an empty one is announced when it fills)
    expect(doneLine()!.getAttribute("role")).toBe("status");
    await click(button("Ava järgmine õppetund"));
    await submit();
    expect(action).toHaveBeenCalledTimes(1);
    const sent = action.mock.calls[0][1];
    expect([sent.get("clientId"), sent.get("courseId"), sent.get("lessonId")]).toEqual(["3", "5", "7"]);
    expect(doneLine()!.textContent).toBe("Õppetund „Kolmas tund“ on avatud.");
    expect($("[data-unlock-confirm]")).toBeNull();
    expect(document.activeElement).toBe(doneLine());
    await show(null); // the page's refresh: that was the last locked lesson
    expect(doneLine()!.textContent).toBe("Õppetund „Kolmas tund“ on avatud.");
    expect(button("Ava järgmine õppetund")).toBeNull();
    await show(fourth); // or the next one is locked: its button under the same line
    expect(doneLine()!.textContent).toBe("Õppetund „Kolmas tund“ on avatud.");
    expect(button("Ava järgmine õppetund")).not.toBeNull();
    await click(button("Ava järgmine õppetund")); // asking about the next one takes the old line away
    expect(doneLine()!.textContent).toBe("");
  });

  test("not ok: the step stays with the error; asking again later does not show the old error", async () => {
    action.mockResolvedValue({ ok: false, error: "notFound" });
    await show(third);
    await click(button("Ava järgmine õppetund"));
    await submit();
    expect($("[data-unlock-confirm] [role='alert']")!.textContent).toBe(adminEt.common.saveError);
    expect(doneLine()!.textContent).toBe("");
    await click(button("Ei"));
    await click(button("Ava järgmine õppetund"));
    expect($("[data-unlock-confirm] [role='alert']")).toBeNull();
  });
});
