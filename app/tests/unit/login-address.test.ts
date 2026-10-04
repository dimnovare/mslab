import { describe, expect, test } from "vitest";
import { readLoginAddress } from "@/components/account/login-address";

// What the login page reads from its address (components/account/login-address.ts): the parameters live in the fragment, and the
// query is read too, for links already out there. Either way they are removed from the address afterwards.

const BASE = "http://localhost:3000/konto/sisene";
const read = (suffix: string) => readLoginAddress(BASE + suffix);

describe("readLoginAddress", () => {
  test("nothing in the address: nothing to read, nothing to clean", () => {
    expect(read("")).toEqual({ problem: null, again: false, email: "", cleaned: null });
    expect(read("#main")).toEqual({ problem: null, again: false, email: "", cleaned: null });
    expect(read("?utm_source=x")).toEqual({ problem: null, again: false, email: "", cleaned: null });
  });

  test("the fragment: viga, korda and email, and the address is cleaned of them", () => {
    expect(read("#viga=link")).toEqual({ problem: "link", again: false, email: "", cleaned: "/konto/sisene" });
    expect(read("#viga=server")).toEqual({ problem: "server", again: false, email: "", cleaned: "/konto/sisene" });
    expect(read("#korda=1")).toEqual({ problem: null, again: true, email: "", cleaned: "/konto/sisene" });
    expect(read("#email=Kati.Tamm%40Example.test")).toEqual({ problem: null, again: false, email: "kati.tamm@example.test", cleaned: "/konto/sisene" });
    expect(read("#viga=link&korda=1&email=a%40example.test")).toEqual({ problem: "link", again: true, email: "a@example.test", cleaned: "/konto/sisene" });
  });

  test("the query, for links already out there (an e-mail with ?viga=link, a bookmark): read the same, and cleaned", () => {
    expect(read("?viga=link")).toEqual({ problem: "link", again: false, email: "", cleaned: "/konto/sisene" });
    expect(read("?korda=1")).toEqual({ problem: null, again: true, email: "", cleaned: "/konto/sisene" });
    expect(read("?email=a%40example.test&viga=server")).toEqual({ problem: "server", again: false, email: "a@example.test", cleaned: "/konto/sisene" });
  });

  test("the fragment wins over the query for the same name", () => {
    expect(read("?viga=server#viga=link").problem).toBe("link");
    expect(read("?email=old%40example.test#email=new%40example.test").email).toBe("new@example.test");
    expect(read("?viga=server#korda=1")).toMatchObject({ problem: "server", again: true });
  });

  test("values that are not ours are ignored: an unknown viga, korda other than 1, something that is no e-mail address", () => {
    expect(read("#viga=nope")).toMatchObject({ problem: null, cleaned: "/konto/sisene" });
    expect(read("#korda=0")).toMatchObject({ again: false, cleaned: "/konto/sisene" });
    expect(read("#korda=true")).toMatchObject({ again: false });
    for (const bad of ["", "nope", "a%40", "%40example.test", "a%20b%40example.test", "a%40example", "x".repeat(300) + "%40example.test"]) expect(read(`#email=${bad}`).email, bad).toBe("");
  });

  test("what the address held besides is kept: other query parameters, an anchor, another fragment parameter", () => {
    expect(read("?viga=link&x=1")).toMatchObject({ problem: "link", cleaned: "/konto/sisene?x=1" });
    expect(read("?viga=link#main")).toMatchObject({ problem: "link", cleaned: "/konto/sisene#main" });
    expect(read("#viga=link&x=1")).toMatchObject({ problem: "link", cleaned: "/konto/sisene#x=1" });
    expect(readLoginAddress("http://localhost:3000/ru/konto/sisene#korda=1")).toMatchObject({ again: true, cleaned: "/ru/konto/sisene" });
  });

  test("a hostile fragment is only ever text: no throw, nothing carried into the cleaned address", () => {
    for (const hash of ["#%", "#%E0%A4%A", "#=", "#&&&", "#viga", "#email=%00", "#viga=%3Cscript%3E", "#a=b=c"]) {
      const r = read(hash);
      expect(() => r.cleaned, hash).not.toThrow();
      expect(r.cleaned === null || r.cleaned.startsWith("/konto/sisene"), hash).toBe(true);
    }
  });
});
