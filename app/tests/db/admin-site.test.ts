import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestDb } from "./helpers";
import type { Db } from "@/db/client";
import { campaign, faq, galleryItems, heroSlides, pages, posts, practicePackages, settings } from "@/db/schema";
import { applySeed } from "@/db/seed-apply";
import { getHomeData, getPage, getPracticePackages, getSettings, listPosts } from "@/db/queries/public";
import {
  deletePostForm,
  loadCampaign,
  loadHome,
  loadPost,
  loadPractice,
  loadSettings,
  loadTrainer,
  saveCampaignForm,
  saveHomeForm,
  savePostForm,
  savePracticeForm,
  saveSettingsForm,
  saveTrainerForm,
} from "@/server/admin-site";
import type { EditResult } from "@/server/edit-check";
import { newPostDraft, type PostDraft } from "@/domain/site-editor";

// Task 13B: the site content editors' form handling on a real (PGlite) database with the prototype seed.

const UPLOAD = "img/0f8b6c2e-3d4a-4b5c-8d9e-0a1b2c3d4e5f.jpg";
const UPLOAD2 = "img/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d.webp";

let db: Db;
beforeEach(async () => {
  db = await makeTestDb();
  await applySeed(db);
});

const form = (parts: Record<string, { version: string; value: unknown }>) => {
  const fd = new FormData();
  fd.set("data", JSON.stringify({ parts }));
  return fd;
};
const fieldsOf = (r: EditResult) => (r.ok ? {} : (r.fields ?? {}));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("home page: hero slides, statement, FAQ", () => {
  test("loads every part with a version; a save with no parts changes nothing", async () => {
    const home = await loadHome(db);
    expect(home.values.slides).toHaveLength(5);
    expect(home.values.slides[0]).toMatchObject({ tone: "light", imagePos: "50% 50%", imagePosMobile: "73% 50%", ctaHref: "/koolitused", active: true });
    expect(home.values.statement.body.et).toMatch(/^Õpetame/);
    expect(home.values.faq).toHaveLength(6);
    for (const name of ["slides", "statement", "faq"]) expect(home.versions[name]).toMatch(/^[0-9a-f]{32}$/);
    expect(await saveHomeForm(db, form({}))).toMatchObject({ ok: true });
    expect((await loadHome(db)).versions).toEqual(home.versions);
  });

  test("slide 1 turns dark with new focal points; the other parts and slides stay as they are", async () => {
    const home = await loadHome(db);
    const slides = clone(home.values.slides);
    slides[0] = { ...slides[0], tone: "dark", imagePos: "30% 60%", imagePosMobile: "80% 40%", title: { et: "  Uus\nslaid  ", ru: " " } };
    const r = await saveHomeForm(db, form({ slides: { version: home.versions.slides, value: slides } }));
    expect(r).toMatchObject({ ok: true });
    const data = await getHomeData(db);
    expect(data.slides[0]).toMatchObject({ tone: "dark", imagePos: "30% 60%", imagePosMobile: "80% 40%", title: { et: "Uus\nslaid" }, sort: 1 });
    expect(data.slides.slice(1).map((s) => s.title.et)).toEqual(home.values.slides.slice(1).map((s) => s.title.et));
    // the result carries the parts as stored now, with their new versions
    const saved = (r as unknown as { saved: { values: { slides: unknown[] }; versions: Record<string, string> } }).saved;
    expect(Object.keys(saved.versions)).toEqual(["slides"]);
    expect(saved.versions.slides).not.toBe(home.versions.slides);
    const after = await loadHome(db);
    expect(after.versions.slides).toBe(saved.versions.slides);
    expect(after.versions.statement).toBe(home.versions.statement);
    expect(after.versions.faq).toBe(home.versions.faq);
  });

  test("a slide is refused without its image or title, with an outside or script link, a bad focal point; at most 8", async () => {
    const home = await loadHome(db);
    const before = await db.select().from(heroSlides);
    const slides = clone(home.values.slides);
    slides[0] = { ...slides[0], imageKey: "" };
    slides[1] = { ...slides[1], title: { et: " ", ru: "Только" }, ctaHref: "javascript:alert(1)" };
    slides[2] = { ...slides[2], ctaHref: "//evil.example/x", imagePos: "120% 50%" };
    slides[3] = { ...slides[3], ctaHref: "http://example.com", imageKey: "https://evil.example/a.jpg" };
    slides[4] = { ...slides[4], ctaHref: "data:text/html,<b>x</b>", imagePosMobile: "50%" };
    expect(fieldsOf(await saveHomeForm(db, form({ slides: { version: home.versions.slides, value: slides } })))).toEqual({
      "slides.0.imageKey": "imageRequired",
      "slides.1.title": "required",
      "slides.1.ctaHref": "href",
      "slides.2.ctaHref": "href",
      "slides.2.imagePos": "focal",
      "slides.3.ctaHref": "href",
      "slides.3.imageKey": "image",
      "slides.4.ctaHref": "href",
      "slides.4.imagePosMobile": "focal",
    });
    const nine = Array.from({ length: 9 }, (_, i) => ({ ...home.values.slides[0], uid: `n${i}` }));
    expect(fieldsOf(await saveHomeForm(db, form({ slides: { version: home.versions.slides, value: nine } })))).toEqual({ slides: "tooMany" });
    expect(await db.select().from(heroSlides)).toEqual(before);
  });

  test("site paths (with a query or a hash) and https addresses are accepted links; a new slide goes where it is put", async () => {
    const home = await loadHome(db);
    const slides = clone(home.values.slides);
    slides[0].ctaHref = "/praktika?pakett=MINI#taotlus";
    slides[1].ctaHref = "https://www.instagram.com/mslab";
    slides.splice(1, 0, { ...slides[2], uid: "new-1", id: null, imageKey: UPLOAD, title: { et: "Uus" }, active: false });
    expect(await saveHomeForm(db, form({ slides: { version: home.versions.slides, value: slides } }))).toMatchObject({ ok: true });
    const stored = await db.select().from(heroSlides).orderBy(heroSlides.sort);
    expect(stored.map((s) => s.ctaHref).slice(0, 3)).toEqual(["/praktika?pakett=MINI#taotlus", slides[1].ctaHref, "https://www.instagram.com/mslab"]);
    expect(stored[1]).toMatchObject({ imageKey: UPLOAD, active: false, sort: 2 });
    expect((await getHomeData(db)).slides).toHaveLength(5); // the hidden one is not on the home page
  });

  test("a saved slide keeps its id; a removed one is deleted; a repeated id (a forged draft) does not update one row twice", async () => {
    const home = await loadHome(db);
    const ids = home.values.slides.map((s) => s.id);
    const slides = clone(home.values.slides);
    const [first] = slides.splice(0, 1); // the first one goes …
    slides.push({ ...first, uid: "copy", title: { et: "Kordus" } }, { ...first, uid: "copy2", title: { et: "Kordus 2" } }); // … and comes back twice
    expect(await saveHomeForm(db, form({ slides: { version: home.versions.slides, value: slides.slice(1) } }))).toMatchObject({ ok: true });
    const stored = await db.select().from(heroSlides).orderBy(heroSlides.sort);
    expect(stored.map((s) => s.title.et)).toEqual([...home.values.slides.slice(2).map((s) => s.title.et), "Kordus", "Kordus 2"]);
    expect(stored.slice(0, 3).map((s) => s.id)).toEqual(ids.slice(2, 5)); // kept their ids
    expect(stored[3].id).toBe(ids[0]); // the first place with that id keeps it
    expect(stored[4].id).not.toBe(ids[0]);
    expect(stored.map((s) => s.id)).not.toContain(ids[1]); // removed
  });

  test("stale: a part saved elsewhere since it was loaded is refused, nothing written; another part still saves", async () => {
    const mine = await loadHome(db);
    const other = await loadHome(db);
    const theirs = clone(other.values.slides);
    theirs[0].tone = "dark";
    expect(await saveHomeForm(db, form({ slides: { version: other.versions.slides, value: theirs } }))).toMatchObject({ ok: true });

    const slides = clone(mine.values.slides);
    slides[1].kicker = { et: "Minu muudatus" };
    const statement = { body: { et: "Uus lause, mis on lühike." } };
    // one stale part refuses the whole save
    expect(await saveHomeForm(db, form({ slides: { version: mine.versions.slides, value: slides }, statement: { version: mine.versions.statement, value: statement } }))).toEqual({ ok: false, error: "stale" });
    expect((await getPage(db, "statement"))!.body.et).toBe(mine.values.statement.body.et);
    expect((await getHomeData(db)).slides[1].kicker.et).not.toBe("Minu muudatus");
    expect((await getHomeData(db)).slides[0].tone).toBe("dark"); // their change is kept
    // the statement alone was not changed elsewhere: it saves; the title is kept
    expect(await saveHomeForm(db, form({ statement: { version: mine.versions.statement, value: statement } }))).toMatchObject({ ok: true });
    expect(await getPage(db, "statement")).toMatchObject({ title: { et: "MS LAB Koolituskeskus" }, body: { et: "Uus lause, mis on lühike." } });
  });

  test("FAQ: rows in their order, blank rows dropped; a question needs its answer; at most 30", async () => {
    const home = await loadHome(db);
    const items = clone(home.values.faq);
    const moved = [items[1], items[0], { uid: "x", q: { et: " " }, a: { et: "" } }, { uid: "y", q: { et: "Uus küsimus?", ru: "Новый вопрос?" }, a: { et: "Jah." } }, ...items.slice(2)];
    expect(await saveHomeForm(db, form({ faq: { version: home.versions.faq, value: moved } }))).toMatchObject({ ok: true });
    const stored = await db.select().from(faq).orderBy(faq.sort);
    expect(stored).toHaveLength(7);
    expect(stored.map((f) => f.q.et).slice(0, 3)).toEqual([items[1].q.et, items[0].q.et, "Uus küsimus?"]);
    expect(stored[2]).toMatchObject({ q: { et: "Uus küsimus?", ru: "Новый вопрос?" }, a: { et: "Jah." }, sort: 3 });
    expect((await getHomeData(db)).faq[0].q.et).toBe(items[1].q.et);

    const now = await loadHome(db);
    const bad = [{ uid: "a", q: { et: "Küsimus ilma vastuseta?" }, a: { et: "" } }, { uid: "b", q: { et: "", ru: "Только русский?" }, a: { et: "Vastus" } }];
    expect(fieldsOf(await saveHomeForm(db, form({ faq: { version: now.versions.faq, value: bad } })))).toEqual({ "faq.0.a": "required", "faq.1.q": "required" });
    const many = Array.from({ length: 31 }, (_, i) => ({ uid: `m${i}`, q: { et: `K${i}?` }, a: { et: "V" } }));
    expect(fieldsOf(await saveHomeForm(db, form({ faq: { version: now.versions.faq, value: many } })))).toEqual({ faq: "tooMany" });
    expect(await db.select().from(faq)).toHaveLength(7);
  });

  test("an unknown part, a malformed draft or no JSON is refused", async () => {
    const home = await loadHome(db);
    expect(await saveHomeForm(db, form({ campaign: { version: home.versions.slides, value: {} } }))).toEqual({ ok: false, error: "invalid" });
    expect(await saveHomeForm(db, form({ slides: { version: home.versions.slides, value: [{ tone: "purple" }] } }))).toEqual({ ok: false, error: "invalid" });
    const fd = new FormData();
    fd.set("data", "{not json");
    expect(await saveHomeForm(db, fd)).toEqual({ ok: false, error: "invalid" });
    expect(await saveHomeForm(db, new FormData())).toEqual({ ok: false, error: "invalid" });
  });
});

describe("practice packages", () => {
  test("MAXI's duration '9 ak' (A8) and its list are stored; MINI is untouched", async () => {
    const p = await loadPractice(db);
    expect(p.codes).toEqual(["MINI", "MAXI"]);
    expect(p.values.MAXI).toMatchObject({ models: "4", price: "150", durationLabel: { et: "8 ak" } });
    const maxi = { ...clone(p.values.MAXI), durationLabel: { et: "9 ak", ru: "9 ак" }, price: "155,50", items: [{ et: "Töö neljal modellil" }, { et: " " }, { et: "Uus punkt", ru: "Новый пункт" }] };
    expect(await savePracticeForm(db, form({ MAXI: { version: p.versions.MAXI, value: maxi } }))).toMatchObject({ ok: true });
    const [mini, stored] = await getPracticePackages(db);
    expect(stored).toMatchObject({ code: "MAXI", durationLabel: { et: "9 ak", ru: "9 ак" }, price: 15550, models: 4, items: [{ et: "Töö neljal modellil" }, { et: "Uus punkt", ru: "Новый пункт" }], sort: 2 });
    expect(mini.durationLabel).toEqual({ et: "4 ak" });
    expect((await loadPractice(db)).versions.MINI).toBe(p.versions.MINI);
  });

  test("name, duration, models and price are required and checked; an unknown package code is refused", async () => {
    const p = await loadPractice(db);
    const bad = { ...clone(p.values.MINI), name: { et: "" }, durationLabel: { et: " " }, models: "99", price: "abc", items: [{ et: "", ru: "Только" }] };
    expect(fieldsOf(await savePracticeForm(db, form({ MINI: { version: p.versions.MINI, value: bad } })))).toEqual({
      "MINI.name": "required",
      "MINI.durationLabel": "required",
      "MINI.models": "whole",
      "MINI.price": "amount",
      "MINI.items": "listEt",
    });
    expect(fieldsOf(await savePracticeForm(db, form({ MINI: { version: p.versions.MINI, value: { ...clone(p.values.MINI), models: "", price: "" } } })))).toEqual({ "MINI.models": "required", "MINI.price": "required" });
    expect(await savePracticeForm(db, form({ XL: { version: p.versions.MINI, value: p.values.MINI } }))).toEqual({ ok: false, error: "invalid" });
    expect((await getPracticePackages(db))[0].price).toBe(10000);
  });

  test("two admins: MINI saved by one, MAXI by the other, both kept; a second MINI save from the old page is stale", async () => {
    const a = await loadPractice(db);
    const b = await loadPractice(db);
    expect(await savePracticeForm(db, form({ MINI: { version: a.versions.MINI, value: { ...clone(a.values.MINI), models: "3" } } }))).toMatchObject({ ok: true });
    expect(await savePracticeForm(db, form({ MAXI: { version: b.versions.MAXI, value: { ...clone(b.values.MAXI), models: "5" } } }))).toMatchObject({ ok: true });
    expect(await savePracticeForm(db, form({ MINI: { version: b.versions.MINI, value: { ...clone(b.values.MINI), models: "1" } } }))).toEqual({ ok: false, error: "stale" });
    expect((await db.select().from(practicePackages).orderBy(practicePackages.sort)).map((x) => x.models)).toEqual([3, 5]);
  });
});

describe("trainer page", () => {
  test("the trainer card: portrait with its focal point, name, role and stats; the contact photo is kept", async () => {
    const t = await loadTrainer(db);
    expect(t.values.trainer).toMatchObject({ portraitKey: "/seed/maria-standing.jpg", portraitPos: "50% 20%", name: "Maria Sosnina" });
    expect(t.values.trainer.stats).toHaveLength(3);
    const trainer = { ...clone(t.values.trainer), portraitKey: UPLOAD, portraitPos: "40% 30%", name: " Maria S. ", role: { et: "Koolitaja", ru: "Тренер" }, stats: [{ uid: "a", value: "10+", label: { et: "aastat", ru: "лет" } }, { uid: "b", value: " ", label: { et: "" } }] };
    expect(await saveTrainerForm(db, form({ trainer: { version: t.versions.trainer, value: trainer } }))).toMatchObject({ ok: true });
    const s = (await getSettings(db)).trainer;
    expect(s).toEqual({ portraitKey: UPLOAD, portraitPos: "40% 30%", contactPhotoKey: "/seed/maria-seated.jpg", name: "Maria S.", role: { et: "Koolitaja", ru: "Тренер" }, stats: [{ value: "10+", label: { et: "aastat", ru: "лет" } }] });
    expect((await loadTrainer(db)).values.trainer.portraitPos).toBe("40% 30%");
  });

  test("refuses a missing name, an outside image, a half stat and more than 3 stats", async () => {
    const t = await loadTrainer(db);
    const four = Array.from({ length: 4 }, (_, i) => ({ uid: `s${i}`, value: String(i), label: { et: "x" } }));
    expect(
      fieldsOf(
        await saveTrainerForm(
          db,
          form({ trainer: { version: t.versions.trainer, value: { ...clone(t.values.trainer), name: "", portraitKey: "https://evil.example/p.jpg", stats: [{ uid: "a", value: "8+", label: { et: "" } }, ...four] } } }),
        ),
      ),
    ).toEqual({ "trainer.name": "required", "trainer.portraitKey": "image", "trainer.stats.0.label": "required", "trainer.stats": "tooMany" });
  });

  test("bio, works gallery and the two stories", async () => {
    const t = await loadTrainer(db);
    expect(t.values.works).toHaveLength(7);
    const works = [{ key: UPLOAD2, alt: { et: "Uus töö", ru: "Новая работа" } }, ...clone(t.values.works).slice(0, 2)];
    const r = await saveTrainerForm(
      db,
      form({
        bio: { version: t.versions.bio, value: { body: { et: "Esimene lõik.\n\nTeine lõik." } } },
        works: { version: t.versions.works, value: works },
        center_story: { version: t.versions.center_story, value: { title: { et: "" }, body: { et: "Lugu.", ru: "История." } } },
        trainer_journey: { version: t.versions.trainer_journey, value: { title: { et: "Minu tee" }, body: { et: "" } } },
      }),
    );
    expect(r).toMatchObject({ ok: true });
    expect(await getPage(db, "trainer_bio")).toMatchObject({ title: { et: "Maria Sosnina" }, body: { et: "Esimene lõik.\n\nTeine lõik." } });
    const gallery = await db.select().from(galleryItems).where(eq(galleryItems.group, "trainer_works")).orderBy(galleryItems.sort);
    expect(gallery.map((g) => [g.key, g.sort])).toEqual([[UPLOAD2, 0], [t.values.works[0].key, 1], [t.values.works[1].key, 2]]);
    expect(gallery[0].alt).toEqual({ et: "Uus töö", ru: "Новая работа" });
    expect(await getPage(db, "center_story")).toMatchObject({ title: { et: "" }, body: { et: "Lugu.", ru: "История." } });
    expect(await getPage(db, "trainer_journey")).toMatchObject({ title: { et: "Minu tee" }, body: { et: "" } });

    const now = await loadTrainer(db);
    const tooMany = Array.from({ length: 25 }, () => ({ key: UPLOAD, alt: { et: "" } }));
    expect(fieldsOf(await saveTrainerForm(db, form({ works: { version: now.versions.works, value: tooMany } })))).toEqual({ works: "tooMany" });
    expect(fieldsOf(await saveTrainerForm(db, form({ works: { version: now.versions.works, value: [{ key: "../../etc/passwd", alt: { et: "" } }] } })))).toEqual({ works: "image" });
  });
});

describe("campaign (D adminCamp + image upload, M3–M5)", () => {
  test("the uploaded image, code and texts are stored; an empty button text becomes 'Leia enda koolitus'", async () => {
    const c = await loadCampaign(db);
    expect(c.values.campaign).toMatchObject({ active: true, code: "TALV15", ctaLabel: { et: "Leia enda koolitus" }, imageKey: "/seed/lash-editorial.jpg" });
    const value = { ...clone(c.values.campaign), imageKey: UPLOAD, code: " kevad-20 ", ctaLabel: { et: " " }, title: { et: "−20% kevadel", ru: "−20% весной" } };
    expect(await saveCampaignForm(db, form({ campaign: { version: c.versions.campaign, value } }))).toMatchObject({ ok: true });
    const [row] = await db.select().from(campaign);
    expect(row).toMatchObject({ imageKey: UPLOAD, code: "KEVAD-20", ctaLabel: { et: "Leia enda koolitus" }, title: { et: "−20% kevadel", ru: "−20% весной" }, active: true });
  });

  test("an active campaign needs its title and image; a switched-off one may stay unfinished; links and codes are checked", async () => {
    const c = await loadCampaign(db);
    const base = clone(c.values.campaign);
    expect(fieldsOf(await saveCampaignForm(db, form({ campaign: { version: c.versions.campaign, value: { ...base, imageKey: "", title: { et: "" }, ctaHref: "javascript:alert(1)", code: "TALV 15" } } })))).toEqual({
      "campaign.imageKey": "imageRequired",
      "campaign.title": "required",
      "campaign.ctaHref": "href",
      "campaign.code": "codeFormat",
    });
    expect(await saveCampaignForm(db, form({ campaign: { version: c.versions.campaign, value: { ...base, active: false, imageKey: "", title: { et: "" } } } }))).toMatchObject({ ok: true });
    expect((await getHomeData(db)).campaign).toBeNull();
  });
});

describe("settings", () => {
  test("contact details and social links (https only); other keys are kept", async () => {
    const s = await loadSettings(db);
    expect(s.values.contact).toEqual({ email: "info@mslab.ee", phone: "", address: "Pärnu", instagram: "", facebook: "" });
    const bad = { email: "info@", phone: "helista mulle", address: "Rüütli 12, Pärnu", instagram: "http://instagram.com/mslab", facebook: "javascript:alert(1)" };
    expect(fieldsOf(await saveSettingsForm(db, form({ contact: { version: s.versions.contact, value: bad } })))).toEqual({
      "contact.email": "email",
      "contact.phone": "phone",
      "contact.instagram": "url",
      "contact.facebook": "url",
    });
    for (const facebook of ["data:text/html,x", "https://", "//facebook.com/x", "https://user:pw@facebook.com/x"])
      expect(fieldsOf(await saveSettingsForm(db, form({ contact: { version: s.versions.contact, value: { ...s.values.contact, facebook } } }))), facebook).toEqual({ "contact.facebook": "url" });
    const good = { email: " maria@mslab.ee ", phone: "+372 5555  0101", address: "Rüütli 12, Pärnu", instagram: "https://www.instagram.com/mslab", facebook: "https://facebook.com/mslab" };
    await db.update(settings).set({ value: { ...s.values.contact, extra: "kept" } }).where(eq(settings.key, "contact"));
    const fresh = await loadSettings(db);
    expect(await saveSettingsForm(db, form({ contact: { version: fresh.versions.contact, value: good } }))).toMatchObject({ ok: true });
    expect((await getSettings(db)).contact).toEqual({ email: "maria@mslab.ee", phone: "+372 5555 0101", address: "Rüütli 12, Pärnu", instagram: "https://www.instagram.com/mslab", facebook: "https://facebook.com/mslab", extra: "kept" });
  });

  test("newsletter discount label and the legal pages", async () => {
    const s = await loadSettings(db);
    expect(fieldsOf(await saveSettingsForm(db, form({ newsletter: { version: s.versions.newsletter, value: { discountLabel: " " } } })))).toEqual({ "newsletter.discountLabel": "required" });
    expect(fieldsOf(await saveSettingsForm(db, form({ terms: { version: s.versions.terms, value: { title: { et: "" }, body: { et: "" } } } })))).toEqual({ "terms.title": "required", "terms.body": "required" });
    const r = await saveSettingsForm(
      db,
      form({
        newsletter: { version: s.versions.newsletter, value: { discountLabel: "15%" } },
        privacy: { version: s.versions.privacy, value: { title: { et: "Privaatsuspoliitika" }, body: { et: "Esimene.\n\nTeine.", ru: "Первый." } } },
      }),
    );
    expect(r).toMatchObject({ ok: true });
    expect((await getSettings(db)).newsletter).toEqual({ discountLabel: "15%" });
    expect(await getPage(db, "privacy")).toMatchObject({ title: { et: "Privaatsuspoliitika" }, body: { et: "Esimene.\n\nTeine.", ru: "Первый." } });
  });
});

describe("posts", () => {
  const draft = (over: Partial<PostDraft> = {}): PostDraft => ({ ...newPostDraft("2026-10-02"), title: { et: "Sügisene uudis" }, category: { et: "Uudis" }, ...over });
  const savePost = (d: PostDraft, version = "") => savePostForm(db, form({ post: { version, value: d } }));

  test("a new post gets a slug from its title, 09:00 Estonian time on its date, and is hidden until published", async () => {
    const r = await savePost(draft({ excerpt: { et: "Lühidalt." }, body: { et: "Üks.\n\nKaks." } }));
    expect(r).toMatchObject({ ok: true, created: true });
    const id = (r as { id: number }).id;
    const [row] = await db.select().from(posts).where(eq(posts.id, id));
    expect(row).toMatchObject({ slug: "sugisene-uudis", published: false, coverKey: "", category: { et: "Uudis" } });
    expect(row.publishedAt.toISOString()).toBe("2026-10-02T06:00:00.000Z");
    expect((await listPosts(db)).map((p) => p.id)).not.toContain(id);

    // publishing needs the cover
    const loaded = (await loadPost(db, id))!;
    expect(loaded.values.post).toMatchObject({ id, slug: "sugisene-uudis", publishedAt: "2026-10-02" });
    expect(fieldsOf(await savePost({ ...loaded.values.post, published: true }, loaded.versions.post))).toEqual({ "post.coverKey": "imageRequired" });
    expect(await savePost({ ...loaded.values.post, published: true, coverKey: UPLOAD, publishedAt: "2026-12-24" }, loaded.versions.post)).toMatchObject({ ok: true, created: false });
    const [first] = await listPosts(db);
    expect(first).toMatchObject({ id, coverKey: UPLOAD });
    expect(first.publishedAt.toISOString()).toBe("2026-12-24T07:00:00.000Z"); // winter: UTC+2
  });

  test("refuses a missing title or category, a bad date, a taken or malformed slug", async () => {
    expect(fieldsOf(await savePost(draft({ title: { et: "" }, category: { et: "" }, publishedAt: "2026-02-30" })))).toEqual({
      "post.title": "required",
      "post.slug": "required",
      "post.category": "required",
      "post.publishedAt": "date",
    });
    expect(fieldsOf(await savePost(draft({ slug: "Mitte Nii!" })))).toEqual({ "post.slug": "slugFormat" });
    expect(fieldsOf(await savePost(draft({ title: { et: "Uus koolitus: Lash Lift BOTOX" } })))).toEqual({ "post.slug": "slugTaken" }); // a seed post
    expect(fieldsOf(await savePost(draft({ publishedAt: "" })))).toEqual({ "post.publishedAt": "required" });
    expect(await db.select().from(posts)).toHaveLength(6);
  });

  test("an edit is stale after a save elsewhere and notFound for a missing post; delete removes it", async () => {
    const [seed] = await listPosts(db);
    const a = (await loadPost(db, seed.id))!;
    const b = (await loadPost(db, seed.id))!;
    expect(await savePost({ ...a.values.post, title: { et: "Muudetud" } }, a.versions.post)).toMatchObject({ ok: true });
    expect(await savePost({ ...b.values.post, title: { et: "Minu oma" } }, b.versions.post)).toEqual({ ok: false, error: "stale" });
    expect((await db.select().from(posts).where(eq(posts.id, seed.id)))[0].title).toEqual({ et: "Muudetud" });
    expect(await savePost({ ...a.values.post, id: 99999 }, a.versions.post)).toEqual({ ok: false, error: "notFound" });

    const del = new FormData();
    del.set("id", String(seed.id));
    expect(await deletePostForm(db, del)).toMatchObject({ ok: true, deleted: true });
    expect(await deletePostForm(db, del)).toEqual({ ok: false, error: "notFound" });
    const bad = new FormData();
    bad.set("id", "x");
    expect(await deletePostForm(db, bad)).toEqual({ ok: false, error: "invalid" });
    expect(await db.select().from(posts)).toHaveLength(5);
  });
});

describe("missing rows", () => {
  test("a page or setting that is not stored yet loads empty and is created on save", async () => {
    await db.delete(pages).where(eq(pages.key, "terms"));
    await db.delete(settings).where(eq(settings.key, "newsletter"));
    const s = await loadSettings(db);
    expect(s.values.terms).toEqual({ title: { et: "" }, body: { et: "" } });
    expect(s.values.newsletter).toEqual({ discountLabel: "" });
    const r = await saveSettingsForm(
      db,
      form({ terms: { version: s.versions.terms, value: { title: { et: "Tingimused" }, body: { et: "Tekst." } } }, newsletter: { version: s.versions.newsletter, value: { discountLabel: "10%" } } }),
    );
    expect(r).toMatchObject({ ok: true });
    expect(await getPage(db, "terms")).toMatchObject({ title: { et: "Tingimused" }, body: { et: "Tekst." } });
    expect((await getSettings(db)).newsletter).toEqual({ discountLabel: "10%" });
  });
});
