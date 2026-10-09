import { rmSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, test } from "vitest";
import * as schema from "@/db/schema";
import { campaign, clients } from "@/db/schema";
import { migrationsThrough } from "./helpers";

// Migration 0005 (phase 2c) as the Railway database goes through it: 0000–0004 applied, Maria's campaign row live, a client, then
// 0005. It adds the newsletter popup's row (switched off) next to the campaign, one row per kind and at most one shown, and leaves
// the new columns empty. Additive: the live code (which reads row 1 and knows no new column) is unaffected.

test("0005 adds the newsletter popup row (off) next to the live campaign, one row per kind, at most one shown, and empty new columns", async () => {
  const db = drizzle(new PGlite(), { schema });
  const through = async (tag: string) => {
    const dir = migrationsThrough(tag);
    try {
      await migrate(db, { migrationsFolder: dir });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
  await through("0004_video_shape");
  await db.execute(sql`
    insert into campaign (id, active, kicker, title, text, code, cta_label, cta_href, image_key)
    values (1, true, '{"et":"K"}', '{"et":"Kampaania"}', '{"et":""}', 'TALV15', '{"et":"Leia enda koolitus"}', '/koolitused', '/seed/lash-editorial.jpg')`);
  await db.execute(sql`insert into clients (email) values ('vana@example.test')`);

  await through("0005_phase2c");

  const rows = await db.select().from(campaign).orderBy(asc(campaign.id));
  expect(rows.map((r) => [r.id, r.kind, r.active, r.code])).toEqual([[1, "campaign", true, "TALV15"], [2, "newsletter", false, ""]]);
  expect(rows[1]).toMatchObject({
    kicker: { et: "MS LABi kirjad", ru: "Письма MS LAB" },
    title: { et: "Hea järgmine samm. Otse sinu postkasti.", ru: "Ваш следующий шаг. В вашем почтовом ящике." },
    ctaLabel: { et: "" },
    ctaHref: "",
    imageKey: "/seed/gift-bag-serum.jpg",
  });
  expect(rows[1].text.et).toBe("Uued koolitused, kasulikud mõtted ja tervitussoodustus sinu esimesele koolitusele.");
  // at most one shown: the newsletter row cannot be switched on while the campaign is
  await expect(db.update(campaign).set({ active: true }).where(eq(campaign.id, 2))).rejects.toThrow();
  await db.update(campaign).set({ active: false }).where(eq(campaign.id, 1));
  await db.update(campaign).set({ active: true }).where(eq(campaign.id, 2));
  // one row per kind
  await expect(db.insert(campaign).values({ id: 3, kind: "newsletter", active: false, kicker: { et: "" }, title: { et: "" }, text: { et: "" }, ctaLabel: { et: "" }, ctaHref: "", imageKey: "" })).rejects.toThrow();
  const [c] = await db.select().from(clients);
  expect([c.passwordHash, c.passwordChangedAt]).toEqual([null, null]);
});
