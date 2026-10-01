import { existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { makeTestDb } from "./helpers";
import type { Db } from "@/db/client";
import { courseSessions, courses, registrations } from "@/db/schema";
import { applySeed } from "@/db/seed-apply";
import * as seedData from "@/db/seed-data";
import { getCourseBySlug, getGallery, getHomeData, getPage, getPracticePackages, getSettings, listPosts, listPublishedCourses, listUpcomingSessions } from "@/db/queries/public";
import { upsertCourse } from "@/db/queries/admin";
import { fromPrice, priceOptions } from "@/domain/course";
import { mediaUrl } from "@/lib/media";

describe("prototype seed", () => {
  let db: Db;
  let first: Record<string, number>;

  beforeAll(async () => {
    db = await makeTestDb();
    first = await applySeed(db);
  });

  test("fills every content table", () => {
    expect(first).toEqual({
      courses: 6,
      course_images: 24,
      course_sessions: 8,
      practice_packages: 2,
      hero_slides: 5,
      faq: 6,
      posts: 6,
      pages: 6,
      gallery_items: 7,
      campaign: 1,
      settings: 3,
    });
  });

  test("is idempotent: a second run changes nothing", async () => {
    const second = await applySeed(db);
    expect(second).toEqual(first);
  });

  test("courses: types, levels, prices and sample flags as agreed", async () => {
    const list = await listPublishedCourses(db);
    expect(list).toHaveLength(6);
    expect(list.every((c) => c.isSample && c.published)).toBe(true);
    const by = Object.fromEntries(list.map((c) => [c.slug, c]));
    const summary = (slug: string) => {
      const c = by[slug];
      return [c.type, c.level, c.price, c.priceGroup, c.priceIndividual];
    };
    expect(summary("kulmumeistri-baaskoolitus")).toEqual(["contact", "basic", null, 35000, 45000]);
    expect(summary("lash-lift-botox")).toEqual(["contact", "basic", null, 29000, 39000]);
    expect(summary("kulmude-lami")).toEqual(["contact", "advanced", null, 22000, 30000]);
    expect(summary("kulmumeistri-e-koolitus")).toEqual(["e_learning", "basic", 19000, null, null]);
    expect(summary("kulmukuju-ja-summeetria")).toEqual(["e_learning", "advanced", 9500, null, null]);
    expect(summary("ripsmete-laminatsiooni-alused")).toEqual(["e_learning", "basic", 15000, null, null]);

    expect(by["kulmumeistri-baaskoolitus"].durationLabel?.et).toBe("2 päeva · 16 ak");
    expect(by["lash-lift-botox"].durationLabel?.et).toBe("8 ak");
    expect(by["kulmude-lami"].durationLabel?.et).toBe("6 ak");
  });

  test("e-learning courses have access period, video and module counts; only the brow course has a next-course discount", async () => {
    const list = await listPublishedCourses(db);
    const online = Object.fromEntries(list.filter((c) => c.type === "e_learning").map((c) => [c.slug, c]));
    expect([online["kulmumeistri-e-koolitus"].accessMonths, online["kulmumeistri-e-koolitus"].videoCount, online["kulmumeistri-e-koolitus"].modules.length]).toEqual([6, 24, 6]);
    expect([online["kulmukuju-ja-summeetria"].accessMonths, online["kulmukuju-ja-summeetria"].videoCount, online["kulmukuju-ja-summeetria"].modules.length]).toEqual([6, 8, 3]);
    expect([online["ripsmete-laminatsiooni-alused"].accessMonths, online["ripsmete-laminatsiooni-alused"].videoCount, online["ripsmete-laminatsiooni-alused"].modules.length]).toEqual([6, 12, 4]);
    expect(online["kulmumeistri-e-koolitus"].nextDiscount?.et).toBe("−10% järgmiselt koolituselt");
    expect(online["kulmukuju-ja-summeetria"].nextDiscount).toBeNull();
  });

  test("no hybrid option: every course offers either one e-learning price or group/individual prices", async () => {
    for (const c of await listPublishedCourses(db)) {
      const kinds = priceOptions(c).map((o) => o.kind);
      expect(kinds).toEqual(c.type === "e_learning" ? ["full"] : ["group", "individual"]);
      expect(fromPrice(c)).not.toBeNull();
    }
  });

  test("contact courses list the eight 'Koolitus sisaldab' items; every course has outcomes and four images", async () => {
    for (const c of await listPublishedCourses(db)) {
      expect(c.outcomes.length).toBeGreaterThan(0);
      expect(c.images).toHaveLength(4);
      expect(c.includes).toHaveLength(c.type === "contact" ? 8 : 0);
    }
    const contact = await getCourseBySlug(db, "kulmumeistri-baaskoolitus");
    expect(contact?.includes.map((i) => i.et)).toEqual([
      "Teooria",
      "Praktika modellidel (nt kahel modellil)",
      "Õppematerjalid, mis jäävad sulle",
      "Koolitaja juhendamine ja personaalne tugi",
      "Teadmiste test",
      "Praktilise töö hindamine",
      "Kõik töövahendid on olemas",
      "Tunnistus pärast edukat lõpetamist",
    ]);
  });

  test("sessions: eight rows on the contact courses, Nov 2026 to Jan 2027, one cancelled, capacity 4-6", async () => {
    const sessions = await listUpcomingSessions(db, new Date("2026-10-01T00:00:00Z"));
    expect(sessions).toHaveLength(8);
    expect(sessions.every((s) => s.course.type === "contact")).toBe(true);
    expect(sessions.filter((s) => s.status === "cancelled")).toHaveLength(1);
    expect(new Set(sessions.map((s) => s.city))).toEqual(new Set(["Pärnu", "Tallinn", "Tartu", "Viljandi"]));
    expect(sessions.every((s) => s.capacity >= 4 && s.capacity <= 6)).toBe(true);
    expect(sessions[0].startsAt.toISOString()).toBe("2026-11-14T08:00:00.000Z");
    expect(sessions[sessions.length - 1].startsAt.toISOString()).toBe("2027-01-23T08:00:00.000Z");
    expect(sessions.every((s) => s.confirmed === 0)).toBe(true);
  });

  test("practice packages carry duration and price (MINI 4 ak / 100 €, MAXI 8 ak / 150 €)", async () => {
    const packages = await getPracticePackages(db);
    expect(packages.map((p) => [p.code, p.models, p.durationLabel.et, p.price])).toEqual([
      ["MINI", 2, "4 ak", 10000],
      ["MAXI", 4, "8 ak", 15000],
    ]);
  });

  test("home data: five slides (first is the flower, tones light/dark/dark/light/light), faq, posts, campaign without a 'not now' button", async () => {
    const home = await getHomeData(db);
    expect(home.slides.map((s) => s.tone)).toEqual(["light", "dark", "dark", "light", "light"]);
    expect(home.slides[0].imageKey).toBe("/seed/flower-hero.png");
    expect(home.slides[0].title.ru).toBeTruthy();
    expect(home.faq).toHaveLength(6);
    expect(home.posts).toHaveLength(6);
    expect(home.campaign?.ctaLabel.et).toBe("Leia enda koolitus");
    expect(Object.keys(home.pages).sort()).toEqual(["center_story", "privacy", "statement", "terms", "trainer_bio", "trainer_journey"]);
    expect(home.settings).toHaveProperty("contact");
    expect(home.settings).toHaveProperty("newsletter", { discountLabel: "10%" });
  });

  test("posts have slugs derived from their titles, newest first", async () => {
    const list = await listPosts(db);
    expect(list.map((p) => p.slug)).toEqual([
      "kuidas-valida-endale-sobiv-kulmukoolitus",
      "uus-koolitus-lash-lift-botox",
      "praktika-modellidega-mida-oodata",
      "kulmude-hooldus-parast-laminatsiooni",
      "ms-lab-koolitused-nuud-ka-tartus-ja-viljandis",
      "esimesest-koolitusest-oma-salongini",
    ]);
  });

  test("placeholder pages are marked for Maria", async () => {
    expect((await getPage(db, "trainer_journey"))?.body.et).toContain("Maria täiendab");
    expect((await getPage(db, "privacy"))?.body.et).toContain("Maria täiendab");
    expect((await getPage(db, "terms"))?.body.et).toContain("Maria täiendab");
  });

  test("trainer works gallery and settings", async () => {
    const gallery = await getGallery(db, "trainer_works");
    expect(gallery).toHaveLength(7);
    const settings = await getSettings(db);
    expect(settings.trainer).toMatchObject({ name: "Maria Sosnina", stats: [{ value: "8+" }, { value: "4" }, { value: "1:4" }] });
    expect(settings.contact).toMatchObject({ email: "info@mslab.ee" });
  });

  test("every seed image exists under public/seed and resolves to itself via mediaUrl", () => {
    const keys = new Set<string>();
    const collect = (value: unknown) => {
      if (typeof value === "string" && value.startsWith("/seed/")) keys.add(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === "object") Object.values(value).forEach(collect);
    };
    collect(seedData);
    expect(keys.size).toBeGreaterThan(10);
    for (const key of keys) {
      expect(existsSync(path.join(__dirname, "../../public", key)), key).toBe(true);
      expect(mediaUrl(key)).toBe(key);
    }
  });

  test("seed content never names an AI tool", () => {
    expect(JSON.stringify(seedData)).not.toMatch(/claude|anthropic|gpt|openai|lovable|gemini|midjourney/i);
  });
});

describe("seed modes", () => {
  test("a re-run never overwrites rows edited in admin or re-adds deleted children", async () => {
    const db = await makeTestDb();
    await applySeed(db);
    const original = (await getCourseBySlug(db, "lash-lift-botox"))!;
    await upsertCourse(db, { slug: "lash-lift-botox", type: "contact", level: "basic", title: { et: "Maria muutis" }, summary: original.summary, body: original.body, published: false });
    await db.delete(courseSessions);

    const counts = await applySeed(db);
    expect((await getCourseBySlug(db, "lash-lift-botox", { includeUnpublished: true }))?.title.et).toBe("Maria muutis");
    expect(counts.courses).toBe(6);
    expect(counts.course_sessions).toBe(0);
  });

  test("--reset restores the prototype content and ids", async () => {
    const db = await makeTestDb();
    await applySeed(db);
    await upsertCourse(db, { slug: "lash-lift-botox", type: "contact", level: "basic", title: { et: "Maria muutis" }, summary: { et: "" }, body: { et: "" } });
    const counts = await applySeed(db, { reset: true });
    expect(counts.courses).toBe(6);
    expect(counts.course_sessions).toBe(8);
    expect((await getCourseBySlug(db, "lash-lift-botox"))?.title.et).toBe("Lash Lift BOTOX baaskoolitus");
    expect((await db.select().from(courses).orderBy(courses.id))[0].id).toBe(1);
  });

  test("--reset refuses to delete registrations unless forced", async () => {
    const db = await makeTestDb();
    await applySeed(db);
    const [course] = await db.select().from(courses).limit(1);
    await db.insert(registrations).values({ courseId: course.id, kind: "individual", name: "A", email: "a@example.com", paymentChoice: "full" });

    await expect(applySeed(db, { reset: true })).rejects.toThrow(/registration/);
    expect(await db.select().from(registrations)).toHaveLength(1);

    const counts = await applySeed(db, { reset: true, force: true });
    expect(counts.courses).toBe(6);
    expect(await db.select().from(registrations)).toHaveLength(0);
  });
});
