"use client";

import { useId, useState, useRef } from "react";
import { CampaignCard } from "@/components/site/CampaignCard";
import { CAMPAIGN_CTA, SITE_LIMITS, type CampaignDraft } from "@/domain/site-editor";
import { adminEt } from "@/i18n/dict/admin";
import { pick } from "@/i18n/field";
import { mediaUrl } from "@/lib/media";
import { saveCampaign } from "@/server/actions/admin-site";
import { Choice } from "./Choice";
import { I18nInput, LangSwitch, type Lang } from "./I18nInput";
import { SaveBar } from "./SaveBar";
import { SingleImage } from "./SingleImage";
import { TextField } from "./TextField";
import { useSiteDraft, type Loaded } from "./useSiteDraft";
import ui from "./ui.module.css";
import ed from "./editor.module.css";
import styles from "./site-editor.module.css";

/**
 * Kampaania: prototype D's adminCamp (Maria C38/C42: "Meeldib, jätame.") — on / off, kicker, title, text, code, the
 * button's text and link — with the image upload she asked for (C43, M5) and the popup card as a live preview (ET or
 * RU). The button says "Leia enda koolitus" (M4); there is no "Mitte praegu" (M3). The popup itself is on the home page.
 */
export function CampaignEditor({ initial, links }: { initial: Loaded<{ campaign: CampaignDraft }>; links: string[] }) {
  const t = adminEt.campaign;
  const uid = useId();
  const form = useRef<HTMLFormElement>(null);
  const d = useSiteDraft(initial, saveCampaign, form);
  const c = d.draft.campaign;
  const set = (patch: Partial<CampaignDraft>) => d.update("campaign", (x) => ({ ...x, ...patch }));
  const err = (f: string) => d.err(`campaign.${f}`);
  const [lang, setLang] = useState<Lang>("et");

  const preview = {
    image: c.imageKey ? mediaUrl(c.imageKey) : "",
    kicker: pick(c.kicker, lang),
    title: pick(c.title, lang),
    text: pick(c.text, lang),
    code: c.code.trim().toUpperCase(),
    ctaLabel: pick(c.ctaLabel, lang) || CAMPAIGN_CTA,
    ctaHref: c.ctaHref,
  };

  return (
    <form ref={form} className={ui.page} onSubmit={d.submit} noValidate data-campaign-editor="">
      <div className={ui.heading}>
        <div>
          <p className={ui.eyebrow}>{t.eyebrow}</p>
          <h1 className={ui.h1}>{t.title}</h1>
          <p className={ui.lead}>{t.lead}</p>
        </div>
      </div>

      <div className={styles.cols}>
        <section className={ui.card} aria-labelledby={`${uid}-form`}>
          <h2 id={`${uid}-form`} className={ui.sr}>
            {t.form}
          </h2>
          <div className={styles.fields}>
            <Choice className={ed.check} label={t.active} hint={t.activeHint} hintClassName={`${ui.muted} ${ui.small}`} type="checkbox" value="1" checked={c.active} onChange={(e) => set({ active: e.target.checked })} data-field="campaign.active" />
            <I18nInput label={t.kicker} value={c.kicker} onChange={(kicker) => set({ kicker })} maxLength={SITE_LIMITS.campaignKicker} error={err("kicker")} name="campaign.kicker" />
            <I18nInput label={t.titleField} value={c.title} onChange={(title) => set({ title })} maxLength={SITE_LIMITS.campaignTitle} error={err("title")} name="campaign.title" />
            <I18nInput label={t.text} value={c.text} onChange={(text) => set({ text })} multiline rows={3} maxLength={SITE_LIMITS.campaignText} error={err("text")} name="campaign.text" />
            <div className={styles.pair}>
              <TextField label={t.code} value={c.code} onChange={(code) => set({ code })} maxLength={SITE_LIMITS.code} hint={t.codeHint} error={err("code")} name="campaign.code" />
              <I18nInput label={t.ctaLabel} value={c.ctaLabel} onChange={(ctaLabel) => set({ ctaLabel })} maxLength={SITE_LIMITS.ctaLabel} hint={t.ctaLabelHint} placeholder={CAMPAIGN_CTA} error={err("ctaLabel")} name="campaign.ctaLabel" />
            </div>
            <TextField label={t.ctaHref} value={c.ctaHref} onChange={(ctaHref) => set({ ctaHref })} maxLength={SITE_LIMITS.href} hint={t.ctaHrefHint} error={err("ctaHref")} inputMode="url" suggestions={links} name="campaign.ctaHref" />
            <SingleImage label={t.image} value={c.imageKey} onChange={(imageKey) => set({ imageKey })} error={err("imageKey")} ratio="16 / 9" name="campaign" />
          </div>
        </section>

        <div className={styles.aside}>
          <section className={ui.card} aria-labelledby={`${uid}-preview`}>
            <div className={styles.previewHead}>
              <h2 id={`${uid}-preview`} className={ui.h3}>
                {t.preview}
              </h2>
              <LangSwitch lang={lang} onChange={setLang} label={t.preview} missingRu={false} />
            </div>
            {!c.active && <p className={`${ui.notice} ${styles.cardLead}`}>{t.off}</p>}
            {/* inert: the preview's button and copy button are pictures of the real ones */}
            <div className={styles.previewBox} inert data-campaign-preview="" data-off={c.active ? undefined : ""} lang={lang}>
              <CampaignCard
                c={preview}
                codeAction={
                  <button type="button" tabIndex={-1}>
                    {t.copy}
                  </button>
                }
              />
            </div>
            <p className={`${ui.muted} ${ui.small} ${styles.previewNote}`}>{t.previewNote}</p>
          </section>
          <section className={ui.card} aria-labelledby={`${uid}-rules`}>
            <h2 id={`${uid}-rules`} className={ui.h3}>
              {t.rules}
            </h2>
            <ul className={styles.rules}>
              {t.rulesList.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <SaveBar status={d.status} pending={d.pending} reloadHref="/admin/kampaania" />
    </form>
  );
}
