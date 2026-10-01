"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./CourseBuy.module.css";

export type ELearningBuyTexts = { priceLabel: string; paymentLabel: string; payNow: string; instalmentSoon: string; instalmentNote: string; buyNow: string };

/**
 * E-learning purchase (Maria's overview, P8 / P9): one price, two payment ways — "Maksa kohe" (100% bank link, the
 * default) and "Vormista järelmaks" (shown, disabled until the instalment partner arrives). "Osta kohe" goes to the cart.
 */
export function ELearningBuy({ price, href, t }: { price: string; href: string; t: ELearningBuyTexts }) {
  const id = useId();
  const [method, setMethod] = useState<"now" | "instalment">("now");
  return (
    <div className={styles.buy} data-buy="">
      <p className={styles.priceRow}>
        <span className={styles.priceLabel}>{t.priceLabel}</span>
        <span className={styles.price}>{price}</span>
      </p>
      <fieldset className={styles.options}>
        <legend className={styles.legend}>{t.paymentLabel}</legend>
        <label className={styles.option}>
          <input type="radio" name={`${id}-pay`} value="now" checked={method === "now"} onChange={() => setMethod("now")} />
          <span className={styles.optionName}>{t.payNow}</span>
        </label>
        <div className={`${styles.option} ${styles.optionDisabled}`}>
          <input
            id={`${id}-instalment`}
            type="radio"
            name={`${id}-pay`}
            value="instalment"
            disabled
            checked={method === "instalment"}
            onChange={() => setMethod("instalment")}
            aria-describedby={`${id}-note`}
          />
          <label htmlFor={`${id}-instalment`} className={styles.optionName}>
            {t.instalmentSoon}
          </label>
          <small id={`${id}-note`} className={styles.optionNote}>
            {t.instalmentNote}
          </small>
        </div>
      </fieldset>
      <Link className={`${ui.btn} ${ui.btnFull}`} href={href}>
        {t.buyNow}
        <Icon name="bag" />
      </Link>
    </div>
  );
}
