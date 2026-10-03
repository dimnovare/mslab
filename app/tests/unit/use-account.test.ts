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
function Probe({ redirect = true }: { redirect?: boolean }) {
  const result = useAccount<{ email?: string; n?: number }>("/api/konto", { locale: "et", redirect });
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

async function mount(redirect = true) {
  await act(async () => root.render(createElement(Probe, { redirect })));
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
    await act(async () => hook().reload());
    await settle();
    expect(localStorage.getItem(EMAIL_KEY)).toBe("mari@example.test");
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
    await act(async () => hook().reload());
    expect(hook().state).toBe("loading"); // a plain reload shows the waiting state
    await act(async () => answer(json(200, { n: 1 })));
    await settle();
    expect(hook().state).toBe("ready");
    expect(hook().data).toEqual({ n: 1 });
  });

  test("a quiet reload keeps the page (ready, the old data) while it asks, takes the new data, and ignores a failure", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { n: 1 }));
    await mount();
    expect(hook().data).toEqual({ n: 1 });

    let answer: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)));
    await act(async () => hook().reload({ quiet: true }));
    expect(hook().state).toBe("ready");
    expect(hook().data).toEqual({ n: 1 });
    await act(async () => answer(json(200, { n: 2 })));
    await settle();
    expect(hook().state).toBe("ready");
    expect(hook().data).toEqual({ n: 2 });

    for (const failure of [() => Promise.resolve(json(500, { ok: false })), () => Promise.reject(new TypeError("network")), () => Promise.resolve(json(200, null))]) {
      fetchMock.mockImplementationOnce(failure);
      await act(async () => hook().reload({ quiet: true }));
      await settle();
      expect(hook().state).toBe("ready");
      expect(hook().data).toEqual({ n: 2 });
    }

    // a 401 still ends the page, quiet or not
    vi.spyOn(window.location, "replace").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(json(401, { ok: false, reason: "replaced" }));
    await act(async () => hook().reload({ quiet: true }));
    await settle();
    expect(hook().state).toBe("replaced");
  });
});
