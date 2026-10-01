import { describe, expect, test } from "vitest";
import { calendarCities, citySlug, contactSessions, parseCity, startOfDayTallinn } from "@/domain/calendar";
import { parsePackage } from "@/domain/practice";

describe("calendar city filter", () => {
  test("citySlug drops case and diacritics", () => {
    expect(citySlug("Pärnu")).toBe("parnu");
    expect(citySlug(" Kohtla-Järve ")).toBe("kohtla-jarve");
    expect(citySlug("Uus  Linn")).toBe("uus-linn");
  });
  test("chips: Maria's four first, other session cities appended once", () => {
    expect(calendarCities([])).toEqual(["Pärnu", "Tallinn", "Tartu", "Viljandi"]);
    expect(calendarCities(["Tartu", "Narva", " narva ", "PÄRNU", ""])).toEqual(["Pärnu", "Tallinn", "Tartu", "Viljandi", "Narva"]);
  });
  test("?linn picks a known city, anything else means all", () => {
    const cities = calendarCities(["Narva"]);
    expect(parseCity("parnu", cities)).toBe("parnu");
    expect(parseCity("Pärnu", cities)).toBe("parnu");
    expect(parseCity(["tallinn", "tartu"], cities)).toBe("tallinn");
    expect(parseCity("narva", cities)).toBe("narva");
    expect(parseCity("rakvere", cities)).toBeNull();
    expect(parseCity("", cities)).toBeNull();
    expect(parseCity(null, cities)).toBeNull();
    expect(parseCity(undefined, cities)).toBeNull();
  });
  test("only contact-course sessions", () => {
    const s = [{ id: 1, course: { type: "contact" as const } }, { id: 2, course: { type: "e_learning" as const } }];
    expect(contactSessions(s).map((x) => x.id)).toEqual([1]);
  });
});

describe("startOfDayTallinn", () => {
  test("winter (UTC+2) and summer (UTC+3)", () => {
    expect(startOfDayTallinn(new Date("2026-11-14T15:30:12.345Z")).toISOString()).toBe("2026-11-13T22:00:00.000Z");
    expect(startOfDayTallinn(new Date("2026-07-01T09:00:00Z")).toISOString()).toBe("2026-06-30T21:00:00.000Z");
  });
  test("just after local midnight is still that local day", () => {
    // 00:30 in Tallinn on 15.11 is 22:30 UTC on 14.11.
    expect(startOfDayTallinn(new Date("2026-11-14T22:30:00Z")).toISOString()).toBe("2026-11-14T22:00:00.000Z");
  });
  test("a session later today is not before the boundary", () => {
    const now = new Date("2026-11-14T12:00:00Z");
    const session = new Date("2026-11-14T08:00:00Z"); // 10:00 local, already started
    expect(session.getTime()).toBeGreaterThanOrEqual(startOfDayTallinn(now).getTime());
  });
});

describe("parsePackage", () => {
  test("matches the code without regard to case", () => {
    expect(parsePackage("MAXI", ["MINI", "MAXI"])).toBe("MAXI");
    expect(parsePackage("mini", ["MINI", "MAXI"])).toBe("MINI");
    expect(parsePackage([" maxi "], ["MINI", "MAXI"])).toBe("MAXI");
    expect(parsePackage("MIDI", ["MINI", "MAXI"])).toBeNull();
    expect(parsePackage(undefined, ["MINI"])).toBeNull();
    expect(parsePackage("", ["MINI"])).toBeNull();
  });
});
