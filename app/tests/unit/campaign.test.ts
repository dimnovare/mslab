import { describe, expect, test } from "vitest";
import { campaignCtaLabel, campaignDelay, campaignView, CAMPAIGN_DELAY_MS, CAMPAIGN_SEEN_KEY } from "@/domain/campaign";
import type { Campaign } from "@/db/schema";
import { et } from "@/i18n/dict/et";
import { ru } from "@/i18n/dict/ru";

const row = (patch: Partial<Campaign> = {}): Campaign => ({
  id: 1,
  active: true,
  kicker: { et: "Talvine pakkumine" },
  title: { et: "−15% Lash Lift BOTOX koolitusele", ru: "−15% на курс Lash Lift BOTOX" },
  text: { et: "Kehtib registreerumisel kuni 30.11." },
  code: " TALV15 ",
  ctaLabel: { et: "Leia enda koolitus" },
  ctaHref: "/koolitused/lash-lift-botox",
  imageKey: "img/0b6f3b7e-2c4d-4f7a-9a59-3d7c2f1e8a10.jpg",
  ...patch,
});

describe("campaign popup", () => {
  test("the session key and the delay are the ones Maria saw in D", () => {
    expect(CAMPAIGN_SEEN_KEY).toBe("mslab-camp");
    expect(CAMPAIGN_DELAY_MS).toBe(6000);
  });

  test("the button text: the admin's own text, else the dictionary's 'Leia enda koolitus' in the page's language (M4)", () => {
    expect(campaignCtaLabel({ et: "Leia enda koolitus" }, "et", et.campaign.cta)).toBe("Leia enda koolitus");
    expect(campaignCtaLabel({ et: "Leia enda koolitus" }, "ru", ru.campaign.cta)).toBe("Найти свой курс");
    expect(campaignCtaLabel({ et: "" }, "et", et.campaign.cta)).toBe("Leia enda koolitus");
    expect(campaignCtaLabel({ et: "  " }, "ru", ru.campaign.cta)).toBe("Найти свой курс");
    expect(campaignCtaLabel(null, "ru", ru.campaign.cta)).toBe("Найти свой курс");
    // her own wording wins; without a Russian one the Estonian text is shown (content falls back to et)
    expect(campaignCtaLabel({ et: "Vaata pakkumist" }, "et", et.campaign.cta)).toBe("Vaata pakkumist");
    expect(campaignCtaLabel({ et: "Vaata pakkumist" }, "ru", ru.campaign.cta)).toBe("Vaata pakkumist");
    expect(campaignCtaLabel({ et: "Vaata pakkumist", ru: "Смотреть" }, "ru", ru.campaign.cta)).toBe("Смотреть");
    expect(campaignCtaLabel({ et: "Leia enda koolitus", ru: " " }, "ru", ru.campaign.cta)).toBe("Найти свой курс");
  });

  test("the card from the stored row: texts in the page's language, the R2 picture through /media, the code trimmed", () => {
    expect(campaignView(row(), "et", et.campaign.cta)).toEqual({
      image: "/media/img/0b6f3b7e-2c4d-4f7a-9a59-3d7c2f1e8a10.jpg",
      kicker: "Talvine pakkumine",
      title: "−15% Lash Lift BOTOX koolitusele",
      text: "Kehtib registreerumisel kuni 30.11.",
      code: "TALV15",
      ctaLabel: "Leia enda koolitus",
      ctaHref: "/koolitused/lash-lift-botox",
    });
    const r = campaignView(row({ imageKey: "/seed/lash-editorial.jpg" }), "ru", ru.campaign.cta)!;
    expect(r.title).toBe("−15% на курс Lash Lift BOTOX");
    expect(r.kicker).toBe("Talvine pakkumine"); // no Russian text: Estonian
    expect(r.ctaLabel).toBe("Найти свой курс");
    expect(r.image).toBe("/seed/lash-editorial.jpg");
  });

  test("no popup for a switched-off campaign, a missing row or one without a title", () => {
    expect(campaignView(null, "et", et.campaign.cta)).toBeNull();
    expect(campaignView(row({ active: false }), "et", et.campaign.cta)).toBeNull();
    expect(campaignView(row({ title: { et: "  " } }), "ru", ru.campaign.cta)).toBeNull();
  });

  test("the delay: 6 s unless a test page sets its own (a finite number of ms, 0 or more)", () => {
    expect(campaignDelay(undefined)).toBe(6000);
    expect(campaignDelay(250)).toBe(250);
    expect(campaignDelay(0)).toBe(0);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, "300", null, {}]) expect(campaignDelay(bad), String(bad)).toBe(6000);
  });
});
