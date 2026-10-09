import { describe, expect, test } from "vitest";
import { forwardsSignedIn, PASSWORD_MARK, readLoginAddress, SIGNED_OUT_MARK } from "@/components/account/login-address";

// What the login page reads from its address (components/account/login-address.ts): the parameters live in the fragment, and the
// query is read too, for links already out there. Either way they are removed from the address afterwards.

const BASE = "http://localhost:3000/konto/sisene";
const read = (suffix: string) => readLoginAddress(BASE + suffix);

describe("readLoginAddress", () => {
  test("nothing in the address: nothing to read, nothing to clean", () => {
    expect(read("")).toEqual({ problem: null, again: false, email: "", code: false, cleaned: null });
    expect(read("#main")).toEqual({ problem: null, again: false, email: "", code: false, cleaned: null });
    expect(read("?utm_source=x")).toEqual({ problem: null, again: false, email: "", code: false, cleaned: null });
  });

  test("the fragment: viga, korda, email and kood, and the address is cleaned of them", () => {
    expect(read("#viga=link")).toEqual({ problem: "link", again: false, email: "", code: false, cleaned: "/konto/sisene" });
    expect(read("#viga=server")).toEqual({ problem: "server", again: false, email: "", code: false, cleaned: "/konto/sisene" });
    expect(read("#korda=1")).toEqual({ problem: null, again: true, email: "", code: false, cleaned: "/konto/sisene" });
    expect(read("#email=Kati.Tamm%40Example.test")).toEqual({ problem: null, again: false, email: "kati.tamm@example.test", code: false, cleaned: "/konto/sisene" });
    expect(read("#viga=link&korda=1&email=a%40example.test")).toEqual({ problem: "link", again: true, email: "a@example.test", code: false, cleaned: "/konto/sisene" });
  });

  test("kood=1 with an address: the code step for that address; without a valid address, or with another value, it is nothing (but is still cleaned away)", () => {
    expect(read("#email=kati%2Btest%40example.test&kood=1")).toEqual({ problem: null, again: false, email: "kati+test@example.test", code: true, cleaned: "/konto/sisene" });
    expect(readLoginAddress("http://localhost:3000/ru/konto/sisene#email=a%40example.test&kood=1")).toMatchObject({ email: "a@example.test", code: true, cleaned: "/ru/konto/sisene" });
    expect(read("#kood=1")).toEqual({ problem: null, again: false, email: "", code: false, cleaned: "/konto/sisene" });
    expect(read("#email=nope&kood=1")).toMatchObject({ email: "", code: false, cleaned: "/konto/sisene" });
    expect(read("#email=a%40example.test&kood=0")).toMatchObject({ email: "a@example.test", code: false });
    expect(read("#email=a%40example.test&kood=true")).toMatchObject({ code: false });
    // the query form of an old or mangled link is read the same, and the fragment wins
    expect(read("?kood=1&email=a%40example.test")).toMatchObject({ email: "a@example.test", code: true, cleaned: "/konto/sisene" });
    expect(read("?kood=0&email=a%40example.test#kood=1")).toMatchObject({ code: true });
    // it travels with the others: viga and korda are read next to it, the page decides who wins
    expect(read("#viga=link&email=a%40example.test&kood=1")).toMatchObject({ problem: "link", code: true, email: "a@example.test" });
    expect(read("#korda=1&email=a%40example.test&kood=1")).toMatchObject({ again: true, code: true });
  });

  test("the query, for links already out there (an e-mail with ?viga=link, a bookmark): read the same, and cleaned", () => {
    expect(read("?viga=link")).toEqual({ problem: "link", again: false, email: "", code: false, cleaned: "/konto/sisene" });
    expect(read("?korda=1")).toEqual({ problem: null, again: true, email: "", code: false, cleaned: "/konto/sisene" });
    expect(read("?email=a%40example.test&viga=server")).toEqual({ problem: "server", again: false, email: "a@example.test", code: false, cleaned: "/konto/sisene" });
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

describe("the signed-out mark (#valja=1, from an account page that found the session gone)", () => {
  test("is read away like the others and leaves nothing else behind", () => {
    expect(SIGNED_OUT_MARK).toBe("valja=1");
    expect(read(`#${SIGNED_OUT_MARK}`)).toEqual({ problem: null, again: false, email: "", code: false, cleaned: "/konto/sisene" });
    expect(readLoginAddress(`http://localhost:3000/ru/konto/sisene#${SIGNED_OUT_MARK}`)).toMatchObject({ cleaned: "/ru/konto/sisene" });
  });
});

describe("the password step's mark (#parool, kept in the address for a reload)", () => {
  test("it is an anchor, no parameter: reading the address finds nothing and cleans nothing, so the mark stays", () => {
    expect(PASSWORD_MARK).toBe("parool");
    expect(read(`#${PASSWORD_MARK}`)).toEqual({ problem: null, again: false, email: "", code: false, cleaned: null });
    expect(readLoginAddress(`http://localhost:3000/ru/konto/sisene#${PASSWORD_MARK}`)).toEqual({ problem: null, again: false, email: "", code: false, cleaned: null });
  });

  test("signed in, the page still sends the browser on to Minu konto (the password is for signing in)", () => {
    expect(forwardsSignedIn(`${BASE}#${PASSWORD_MARK}`, true, "kati@example.test")).toBe(true);
    expect(forwardsSignedIn(`${BASE}#${PASSWORD_MARK}`, false, "kati@example.test")).toBe(false);
  });
});

describe("forwardsSignedIn: does the login page send a signed-in browser straight on to Minu konto?", () => {
  const OWN = "kati@example.test";
  const at = (suffix: string, path = "/konto/sisene") => `http://localhost:3000${path}${suffix}`;

  test("signed in, an address that asks for nothing: yes (the plain page, the account button of an e-mail for her own address, Russian too)", () => {
    expect(forwardsSignedIn(at(""), true, OWN)).toBe(true);
    expect(forwardsSignedIn(at(`#email=${encodeURIComponent(OWN)}`), true, OWN)).toBe(true);
    expect(forwardsSignedIn(at(`#email=${encodeURIComponent("Kati@Example.TEST")}`), true, " KATI@example.test ")).toBe(true); // compared normalised
    expect(forwardsSignedIn(at(`#email=${encodeURIComponent(OWN)}`, "/ru/konto/sisene"), true, OWN)).toBe(true);
    expect(forwardsSignedIn(at("#main"), true, "")).toBe(true); // an anchor is no parameter
    expect(forwardsSignedIn(at("#email=nope"), true, OWN)).toBe(true); // no address is no other address
    expect(forwardsSignedIn(at("?utm_source=x"), true, "")).toBe(true);
  });

  test("not signed in (no hint cookie): never", () => {
    for (const suffix of ["", `#email=${encodeURIComponent(OWN)}`]) expect(forwardsSignedIn(at(suffix), false, OWN)).toBe(false);
  });

  test("an address that asks the page for something keeps it: viga, korda, kood (any value, fragment or query), and the signed-out mark", () => {
    for (const suffix of ["#viga=link", "#viga=server", "#viga=nope", "#korda=1", "#korda=0", `#email=${encodeURIComponent(OWN)}&kood=1`, "#kood=1", `#${SIGNED_OUT_MARK}`, "?viga=link", "?korda=1", "?valja=1", `?kood=1&email=${encodeURIComponent(OWN)}`])
      expect(forwardsSignedIn(at(suffix), true, OWN), suffix).toBe(false);
  });

  test("an e-mail for another address than the one this browser signed in with keeps the form (a shared device), also when none is remembered", () => {
    expect(forwardsSignedIn(at(`#email=${encodeURIComponent("mari@example.test")}`), true, OWN)).toBe(false);
    expect(forwardsSignedIn(at(`?email=${encodeURIComponent("mari@example.test")}`), true, OWN)).toBe(false);
    expect(forwardsSignedIn(at(`#email=${encodeURIComponent(OWN)}`), true, "")).toBe(false); // storage blocked: the old way, the form
  });
});
