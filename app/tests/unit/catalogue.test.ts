import { describe, expect, test } from "vitest";
import {
  bookableCities,
  catalogueSearch,
  firstSentence,
  initialSession,
  matchesCatalogue,
  normalizeSearch,
  paragraphs,
  parseCatalogueQuery,
  recommendationPool,
} from "@/domain/catalogue";
import { parseFavourites, toggleFavourite } from "@/lib/favourites";

describe("catalogue query", () => {
  test("parses vorm and tase, ignores anything else", () => {
    expect(parseCatalogueQuery({})).toEqual({ vorm: "all", tase: "all", hybrid: false });
    expect(parseCatalogueQuery({ vorm: "e", tase: "baas" })).toEqual({ vorm: "e", tase: "baas", hybrid: false });
    expect(parseCatalogueQuery({ vorm: "k", tase: "taiend" })).toEqual({ vorm: "k", tase: "taiend", hybrid: false });
    expect(parseCatalogueQuery({ vorm: ["k", "e"], tase: "x" })).toEqual({ vorm: "k", tase: "all", hybrid: false });
  });
  test("vorm=h is not a filter: all courses, hybrid explanation open (K1)", () => {
    expect(parseCatalogueQuery({ vorm: "h" })).toEqual({ vorm: "all", tase: "all", hybrid: true });
  });
  test("search string", () => {
    expect(catalogueSearch({ vorm: "all", tase: "all" })).toBe("");
    expect(catalogueSearch({ vorm: "e", tase: "all" })).toBe("?vorm=e");
    expect(catalogueSearch({ vorm: "k", tase: "taiend" })).toBe("?vorm=k&tase=taiend");
    expect(catalogueSearch({ vorm: "all", tase: "baas" })).toBe("?tase=baas");
  });
});

describe("catalogue filter", () => {
  const brow = { type: "contact" as const, level: "basic" as const, text: normalizeSearch("Kulmumeistri baaskoolitus Tugev vundament") };
  const shape = { type: "e_learning" as const, level: "advanced" as const, text: normalizeSearch("Kulmukuju ja sümmeetria") };
  test("format and level", () => {
    expect(matchesCatalogue(brow, { vorm: "all", tase: "all", search: "" })).toBe(true);
    expect(matchesCatalogue(brow, { vorm: "e", tase: "all", search: "" })).toBe(false);
    expect(matchesCatalogue(brow, { vorm: "k", tase: "baas", search: "" })).toBe(true);
    expect(matchesCatalogue(brow, { vorm: "k", tase: "taiend", search: "" })).toBe(false);
    expect(matchesCatalogue(shape, { vorm: "e", tase: "taiend", search: "" })).toBe(true);
  });
  test("search ignores case, diacritics and extra spaces", () => {
    expect(matchesCatalogue(shape, { vorm: "all", tase: "all", search: "SUMMEETRIA" })).toBe(true);
    expect(matchesCatalogue(shape, { vorm: "all", tase: "all", search: "  kulmukuju   ja " })).toBe(true);
    expect(matchesCatalogue(brow, { vorm: "all", tase: "all", search: "vundament" })).toBe(true);
    expect(matchesCatalogue(brow, { vorm: "all", tase: "all", search: "ripsmed" })).toBe(false);
  });
  test("normalizeSearch", () => expect(normalizeSearch(" Õppevorm  ÄÖÜ š ")).toBe("oppevorm aou s"));
});

describe("course page rules", () => {
  test("firstSentence", () => {
    expect(firstSentence("E-õpe tähendab videokoolitust. Ostuga luuakse konto.")).toBe("E-õpe tähendab videokoolitust.");
    expect(firstSentence("Üks lause ilma punktita")).toBe("Üks lause ilma punktita");
  });
  test("recommendation pool: same type plus Maria's manual picks", () => {
    const all = [
      { id: 1, type: "contact" as const },
      { id: 2, type: "contact" as const },
      { id: 3, type: "e_learning" as const },
      { id: 4, type: "e_learning" as const },
    ];
    expect(recommendationPool({ type: "contact", recommendationIds: [] }, all).map((c) => c.id)).toEqual([1, 2]);
    expect(recommendationPool({ type: "contact", recommendationIds: [4] }, all).map((c) => c.id)).toEqual([1, 2, 4]);
    expect(recommendationPool({ type: "e_learning", recommendationIds: [] }, all).map((c) => c.id)).toEqual([3, 4]);
  });
  test("bookable cities keep date order, once each, without cancelled sessions", () => {
    expect(
      bookableCities([
        { city: "Pärnu", status: "scheduled" },
        { city: "Tartu", status: "cancelled" },
        { city: "Pärnu", status: "scheduled" },
        { city: "Tallinn ", status: "scheduled" },
      ]),
    ).toEqual(["Pärnu", "Tallinn"]);
  });
  test("initial session from ?sessioon only when it can be picked", () => {
    const s = [
      { id: 5, disabled: false },
      { id: 6, disabled: true },
    ];
    expect(initialSession(s, "5")).toBe(5);
    expect(initialSession(s, ["5"])).toBe(5);
    expect(initialSession(s, "6")).toBeNull();
    expect(initialSession(s, "7")).toBeNull();
    expect(initialSession(s, "abc")).toBeNull();
    expect(initialSession(s, undefined)).toBeNull();
  });
  test("paragraphs", () => expect(paragraphs("Üks.\n\n  Kaks.\n \nKolm.")).toEqual(["Üks.", "Kaks.", "Kolm."]));
});

describe("favourites", () => {
  test("parse is defensive", () => {
    expect(parseFavourites(null)).toEqual([]);
    expect(parseFavourites("not json")).toEqual([]);
    expect(parseFavourites('{"a":1}')).toEqual([]);
    expect(parseFavourites('["a", 3, "", "b", "a"]')).toEqual(["a", "b"]);
  });
  test("toggle adds and removes", () => {
    expect(toggleFavourite([], "lami")).toEqual(["lami"]);
    expect(toggleFavourite(["x", "lami"], "lami")).toEqual(["x"]);
  });
});
