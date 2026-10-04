// @vitest-environment happy-dom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ACCOUNT_EVENT, EMAIL_KEY, useAccount } from "@/components/account/useAccount";

// useAccount's states (components/account/useAccount.ts), which every account page goes through (AccountLoader):
// ready, another device (replaced), signed out (to the login page), a server error, an answer without data, and the
// quiet reload that keeps the page as it is. fetch is answered here; nothing leaves the test.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Hook = ReturnType<typeof useAccount<{ email?: string; n?: number }>>;
/** What the hook returned at the last commit. */
const probe: { current: Hook | null } = { current: null };
const hook = (): Hook => probe.current!;
function Probe({ redirect = true, notFound = false }: { redirect?: boolean; notFound?: boolean }) {
  const result = useAccount<{ email?: string; n?: number }>("/api/konto", { locale: "et", redirect, notFound });
  useEffect(() => {
    probe.current = result;
  });
  return null;
}

const json = (status: number, body: unknown) => new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const text = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/html" } });

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

/** Lets the answers and React's updates settle. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });

async function mount(redirect = true, notFound = false) {
  await act(async () => root.render(createElement(Probe, { redirect, notFound })));
  await settle();
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  localStorage.clear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAccount", () => {
  test("200 with data: ready, the data, and the e-mail remembered for the next login (also the dashboard's client.email)", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { email: "kati@example.test" }));
    await mount();
    expect(hook().state).toBe("ready");
    expect(hook().data).toEqual({ email: "kati@example.test" });
    expect(localStorage.getItem(EMAIL_KEY)).toBe("kati@example.test");
    expect(fetchMock).toHaveBeenCalledWith("/api/konto", expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));

    localStorage.clear();
    fetchMock.mockResolvedValueOnce(json(200, { client: { email: "mari@example.test" } }));
    await act(async () => void hook().reload());
    await settle();
    expect(localStorage.getItem(EMAIL_KEY)).toBe("mari@example.test");
  });

  test("every 200 keeps the account's favourites in this tab and merges the browser's own once (lib/favourites.ts); a 401 forgets the copy", async () => {
    sessionStorage.clear();
    localStorage.setItem("mslab-fav", '["lami"]');
    const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === "POST" ? json(200, { ok: true, favourites: ["lami", "botox"] }) : json(200, { client: { email: "kati@example.test" }, favourites: ["botox"] }),
    );
    await mount();
    expect(hook().state).toBe("ready");
    expect(posts()).toHaveLength(1);
    expect(posts()[0][0]).toBe("/api/konto/lemmikud/merge");
    expect(JSON.parse(String(posts()[0][1]?.body))).toEqual({ slugs: ["lami"] });
    expect(localStorage.getItem("mslab-fav")).toBeNull();
    expect(sessionStorage.getItem("mslab-account-fav")).toBe('["lami","botox"]');

    // the next load of an account page: nothing left to merge; its list is the copy now
    fetchMock.mockImplementation(async () => json(200, { client: { email: "kati@example.test" }, favourites: ["lami", "botox", "e-kursus"] }));
    await act(async () => void hook().reload({ quiet: true }));
    await settle();
    expect(posts()).toHaveLength(1);
    expect(sessionStorage.getItem("mslab-account-fav")).toBe('["lami","botox","e-kursus"]');

    // signed out: the copy is gone, so the course pages' ♡ shows this browser's own list again
    vi.spyOn(window.location, "replace").mockImplementation(() => {});
    fetchMock.mockImplementation(async () => json(401, { ok: false, reason: "none" }));
    await act(async () => void hook().reload({ quiet: true }));
    await settle();
    expect(hook().state).toBe("signedOut");
    expect(sessionStorage.getItem("mslab-account-fav")).toBeNull();
  });

  test("a merge that fails keeps the browser's favourites for the next account load", async () => {
    sessionStorage.clear();
    localStorage.setItem("mslab-fav", '["lami"]');
    fetchMock.mockImplementation(async (_input, init) => (init?.method === "POST" ? json(500, { ok: false, error: "server" }) : json(200, { email: "kati@example.test" })));
    await mount();
    expect(hook().state).toBe("ready");
    expect(localStorage.getItem("mslab-fav")).toBe('["lami"]');
    expect(sessionStorage.getItem("mslab-account-fav")).toBeNull();
  });

  test("401 replaced: the 'another device' state, no redirect; the header is told (the hint cookie is gone)", async () => {
    const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    const told = vi.fn();
    window.addEventListener(ACCOUNT_EVENT, told);
    fetchMock.mockResolvedValueOnce(json(401, { ok: false, reason: "replaced" }));
    await mount();
    expect(hook().state).toBe("replaced");
    expect(hook().data).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(told).toHaveBeenCalledTimes(1);
    window.removeEventListener(ACCOUNT_EVENT, told);
  });

  test("any other 401: signed out, and off to the login page of the page's language (unless told to stay)", async () => {
    const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(json(401, { ok: false, reason: "none" }));
    await mount();
    expect(hook().state).toBe("signedOut");
    expect(replace).toHaveBeenCalledWith("/konto/sisene");

    replace.mockClear();
    await act(async () => root.unmount());
    root = createRoot(container);
    fetchMock.mockResolvedValueOnce(json(401, { ok: false, reason: "logout" }));
    await mount(false);
    expect(hook().state).toBe("signedOut");
    expect(replace).not.toHaveBeenCalled();
  });

  test("500, no answer at all, and a 200 without a JSON object are errors, never an endless wait; reload() asks again", async () => {
    for (const answer of [() => Promise.resolve(json(500, { ok: false })), () => Promise.reject(new TypeError("network")), () => Promise.resolve(json(200, null)), () => Promise.resolve(text(200, "<html>oops</html>")), () => Promise.resolve(json(200, "just a string"))]) {
      fetchMock.mockReset();
      fetchMock.mockImplementationOnce(answer);
      await act(async () => root.unmount());
      root = createRoot(container);
      await mount();
      expect(hook().state).toBe("error");
      expect(hook().data).toBeNull();
    }
    let answer: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
    await act(async () => void hook().reload());
    expect(hook().state).toBe("loading"); // a plain reload shows the waiting state
    await act(async () => answer(json(200, { n: 1 })));
    await settle();
    expect(hook().state).toBe("ready");
    expect(hook().data).toEqual({ n: 1 });
  });

  test("a page that asks for it gets 404 as its own state, \"notFound\", when it is the API's own answer: no redirect, no sign-in event", async () => {
    const replace = vi.spyOn(window.location, "replace").mockImplementation(() => {});
    const told = vi.fn();
    window.addEventListener(ACCOUNT_EVENT, told);
    fetchMock.mockResolvedValueOnce(json(404, { ok: false }));
    await mount(true, true);
    expect(hook().state).toBe("notFound");
    expect(hook().data).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(told).not.toHaveBeenCalled();
    window.removeEventListener(ACCOUNT_EVENT, told);

    fetchMock.mockResolvedValueOnce(json(404, { ok: false, error: "slug" }));
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount(true, true);
    expect(hook().state).toBe("notFound");
  });

  test("any other 404 is an error, never \"notFound\": a page of the platform or a proxy (HTML, no body, JSON that is not the API's), and every 404 for a page that did not ask", async () => {
    for (const [asked, answer] of [
      [true, () => text(404, "<html>404 This page could not be found</html>")],
      [true, () => text(404, "")],
      [true, () => json(404, { message: "not found" })],
      [true, () => json(404, null)],
      [true, () => json(404, [])],
      [false, () => json(404, { ok: false })],
    ] as const) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValueOnce(answer());
      await act(async () => root.unmount());
      root = createRoot(container);
      await mount(true, asked);
      expect(hook().state, `asked: ${asked}`).toBe("error");
    }
  });

  test("a quiet reload: the API's 404 moves a page that asked for it to \"notFound\"; for any other 404 it keeps the page as it is", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { n: 1 }));
    await mount(true, true);
    expect(hook().state).toBe("ready");
    // a platform 404 (HTML) is a failure of the reload, which a quiet reload ignores
    fetchMock.mockResolvedValueOnce(text(404, "<html>404</html>"));
    await act(async () => void hook().reload({ quiet: true }));
    await settle();
    expect(hook().state).toBe("ready");
    expect(hook().data).toEqual({ n: 1 });
    // the API's own answer is one the page shows
    fetchMock.mockResolvedValueOnce(json(404, { ok: false }));
    await act(async () => void hook().reload({ quiet: true }));
    await settle();
    expect(hook().state).toBe("notFound");
    expect(hook().data).toBeNull();
    fetchMock.mockResolvedValueOnce(json(200, { n: 2 }));
    await act(async () => void hook().reload());
    await settle();
    expect(hook().state).toBe("ready");
    expect(hook().data).toEqual({ n: 2 });

    // a page that did not ask: the same 404 changes nothing in a quiet reload
    await act(async () => root.unmount());
    root = createRoot(container);
    fetchMock.mockResolvedValueOnce(json(200, { n: 1 }));
    await mount(true, false);
    fetchMock.mockResolvedValueOnce(json(404, { ok: false }));
    await act(async () => void hook().reload({ quiet: true }));
    await settle();
    expect(hook().state).toBe("ready");
    expect(hook().data).toEqual({ n: 1 });
  });

  test("reload() says whether the server answered: true for an answer the page shows (also one that ends it), false for a failure or when it is overtaken", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { n: 1 }));
    await mount(true, true);
    const outcomes: boolean[] = [];
    const ask = async (answer: () => Promise<Response>, opts = { quiet: true }) => {
      fetchMock.mockImplementationOnce(answer);
      let done: Promise<boolean> | undefined;
      await act(async () => {
        done = hook().reload(opts);
      });
      await settle();
      outcomes.push(await done!);
    };
    await ask(async () => json(200, { n: 2 }));
    await ask(async () => json(500, { ok: false }));
    await ask(() => Promise.reject(new TypeError("network")));
    await ask(async () => json(200, null));
    await ask(async () => text(404, "<html>404</html>"));
    vi.spyOn(window.location, "replace").mockImplementation(() => {});
    await ask(async () => json(401, { ok: false, reason: "replaced" }));
    expect(outcomes).toEqual([true, false, false, false, false, true]);
    await ask(async () => json(404, { ok: false }), { quiet: false });
    expect(outcomes.at(-1)).toBe(true); // an answer that ends the page: the API's 404

    // overtaken by a newer reload: the first answers false, the second as it is answered
    let answerFirst: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answerFirst = resolve)));
    let first: Promise<boolean> | undefined;
    await act(async () => {
      first = hook().reload({ quiet: true });
    });
    fetchMock.mockImplementationOnce(async () => json(200, { n: 3 }));
    let second: Promise<boolean> | undefined;
    await act(async () => {
      second = hook().reload({ quiet: true });
    });
    await settle();
    await act(async () => answerFirst(json(200, { n: 9 })));
    await settle();
    expect(await first!).toBe(false);
    expect(await second!).toBe(true);
    expect(hook().data).toEqual({ n: 3 });
  });

  test("a quiet reload keeps the page (ready, the old data) while it asks, takes the new data, and ignores a failure", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { n: 1 }));
    await mount();
    expect(hook().data).toEqual({ n: 1 });

    let answer: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
    await act(async () => void hook().reload({ quiet: true }));
    expect(hook().state).toBe("ready");
    expect(hook().data).toEqual({ n: 1 });
    await act(async () => answer(json(200, { n: 2 })));
    await settle();
    expect(hook().state).toBe("ready");
    expect(hook().data).toEqual({ n: 2 });

    for (const failure of [() => Promise.resolve(json(500, { ok: false })), () => Promise.reject(new TypeError("network")), () => Promise.resolve(json(200, null))]) {
      fetchMock.mockImplementationOnce(failure);
      await act(async () => void hook().reload({ quiet: true }));
      await settle();
      expect(hook().state).toBe("ready");
      expect(hook().data).toEqual({ n: 2 });
    }

    // a 401 still ends the page, quiet or not
    vi.spyOn(window.location, "replace").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(json(401, { ok: false, reason: "replaced" }));
    await act(async () => void hook().reload({ quiet: true }));
    await settle();
    expect(hook().state).toBe("replaced");
  });
});
