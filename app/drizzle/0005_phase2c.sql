ALTER TABLE "campaign" ADD COLUMN "kind" text DEFAULT 'campaign' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "password_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lesson_progress" ADD COLUMN "clock_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_kind" ON "campaign" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_one_active" ON "campaign" USING btree ("active") WHERE "campaign"."active";
--> statement-breakpoint
-- Data step (by hand): the newsletter popup's row, switched off, with default texts; the admin's "Hüpikaken" edits it (phase 2c).
INSERT INTO "campaign" ("id", "kind", "active", "kicker", "title", "text", "code", "cta_label", "cta_href", "image_key")
VALUES (2, 'newsletter', false,
  '{"et":"MS LABi kirjad","ru":"Письма MS LAB"}',
  '{"et":"Hea järgmine samm. Otse sinu postkasti.","ru":"Ваш следующий шаг. В вашем почтовом ящике."}',
  '{"et":"Uued koolitused, kasulikud mõtted ja tervitussoodustus sinu esimesele koolitusele.","ru":"Новые курсы, полезные идеи и приветственная скидка на первый курс."}',
  '', '{"et":""}', '', '/seed/gift-bag-serum.jpg')
ON CONFLICT DO NOTHING;
