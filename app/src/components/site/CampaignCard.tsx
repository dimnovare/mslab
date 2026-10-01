import Link from "next/link";
import type { ReactNode } from "react";
import ui from "./ui.module.css";
import styles from "./CampaignCard.module.css";

export type CampaignCardData = {
  image: string;
  kicker: string;
  title: string;
  text: string;
  code: string;
  ctaLabel: string;
  ctaHref: string;
};

/**
 * The campaign popup's card (prototype D `campHtml`, Maria C37/C38): picture, kicker, Jost title, text, the code in a
 * dashed pill and the button ("Leia enda koolitus", M4) — without D's "Mitte praegu" (M3). Presentational only: the
 * dialog around it (when it opens, closing, focus) is the popup's own; the admin shows this card as its live preview.
 * Two columns when the card has room (container query), picture on top otherwise (D's phone sheet).
 * `codeAction`: the copy button next to the code; `close`: the close button in the corner.
 */
export function CampaignCard({ c, titleId, codeAction, close }: { c: CampaignCardData; titleId?: string; codeAction?: ReactNode; close?: ReactNode }) {
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
            <Link className={ui.btn} href={c.ctaHref}>
              {c.ctaLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
