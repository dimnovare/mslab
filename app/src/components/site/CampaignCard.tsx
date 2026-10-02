import Link from "next/link";
import type { ReactNode } from "react";
import type { CampaignView } from "@/domain/campaign";
import { linkFor } from "@/domain/site-editor";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./CampaignCard.module.css";

/**
 * The campaign popup's card (prototype D `campHtml`, Maria C37/C38): picture, kicker, Jost title, text, the code in a
 * dashed pill and the button ("Leia enda koolitus", M4; B's dark pill with →) — without D's "Mitte praegu" (M3). Presentational only: the
 * dialog around it (when it opens, closing, focus) is the popup's own; the admin shows this card as its live preview.
 * Two columns when the card has room (container query), picture on top otherwise (D's phone sheet).
 * `codeAction`: the copy button next to the code; `close`: the close button in the corner. The button's link is made
 * here, through linkFor: a site path gets the page's locale, an https address stays, anything else (never stored by the
 * admin) goes to the catalogue, so a popup built on this card cannot render a script or outside link by mistake.
 */
export function CampaignCard({ c, locale, titleId, codeAction, close }: { c: CampaignView; locale: Locale; titleId?: string; codeAction?: ReactNode; close?: ReactNode }) {
  const cta = linkFor(c.ctaHref, (path) => href(locale, path), "/koolitused");
  return (
    <div className={styles.wrap}>
      <div className={styles.camp} data-campaign-card="">
        {close}
        <div className={styles.photo}>
          {/* eslint-disable-next-line @next/next/no-img-element -- an upload shown at its own size; no optimisation route on the Worker */}
          {c.image && <img className={styles.image} src={c.image} alt="" />}
        </div>
        <div className={styles.body}>
          {c.kicker && <p className={`${ui.caps} ${styles.kicker}`}>{c.kicker}</p>}
          <h2 id={titleId} className={styles.title}>
            {c.title}
          </h2>
          {c.text && <p className={styles.text}>{c.text}</p>}
          {c.code && (
            <div className={styles.code}>
              <span data-campaign-code="">{c.code}</span>
              {codeAction}
            </div>
          )}
          <div className={styles.actions}>
            {/* B's primary dark pill with the arrow, as the hero's first button (C40/C41) */}
            <Link className={ui.btn} href={cta} data-campaign-cta="">
              {c.ctaLabel}
              <Icon name="arrow" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
