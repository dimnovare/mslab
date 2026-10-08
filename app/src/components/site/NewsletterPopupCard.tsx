import type { ReactNode } from "react";
import type { NewsletterPopupView } from "@/domain/campaign";
import { keepNamesTogether } from "@/lib/typography";
import ui from "./ui.module.css";
import styles from "./CampaignCard.module.css";

/**
 * The newsletter popup's card (phase 2c): the campaign card's picture, kicker, Jost title and text (CampaignCard.module.css), with the
 * sign-up form in place of the code and the button. Presentational only: the dialog is the popup's (NewsletterPopup), and `form` is
 * given — the real NewsletterForm on the home page, the same form inert in the admin's preview.
 */
export function NewsletterPopupCard({ n, titleId, close, form }: { n: NewsletterPopupView; titleId?: string; close?: ReactNode; form: ReactNode }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.camp} data-newsletter-card="">
        {close}
        <div className={styles.photo}>
          {/* eslint-disable-next-line @next/next/no-img-element -- an upload already resized in the browser (ImageUpload) and served by /media, as CampaignCard */}
          {n.image && <img className={styles.image} src={n.image} alt="" />}
        </div>
        <div className={styles.body}>
          {n.kicker && <p className={`${ui.caps} ${styles.kicker}`}>{n.kicker}</p>}
          <h2 id={titleId} className={styles.title}>
            {keepNamesTogether(n.title)}
          </h2>
          {n.text && <p className={styles.text}>{n.text}</p>}
          <div className={styles.signup}>{form}</div>
        </div>
      </div>
    </div>
  );
}
