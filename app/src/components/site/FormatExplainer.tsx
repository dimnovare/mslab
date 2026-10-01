"use client";

import { useId } from "react";
import { Steps, type Step } from "./Steps";
import ui from "./ui.module.css";
import styles from "./FormatExplainer.module.css";

export type ExplainerFormat = { name: string; question: string; definition: string; /** first sentence, for the overview card */ card: string; steps?: Step[] };
export type ExplainerTexts = { overview: string; journey: string; howItWorks: string; readMore: string; hybridNote: string };

/**
 * Prototype D catalogue explainer (`initCatalog` #explain) on its D canvas surface.
 * - "Kõik": D's three "Õppevormid" cards (K7). E-õpe / Kontaktõpe pick that format; Hübriidõpe opens its
 *   description in place and filters nothing (K1, K8).
 * - E-õpe / Kontaktõpe: "Sinu õppeteekond" with the question, the definition at 16px (K6) and the centred steps (K5, K11).
 *   A closing note offers the hybrid explanation, because combining the two formats is how hybrid works.
 */
export function FormatExplainer({
  mode,
  hybridOpen,
  formats,
  t,
  onFormat,
  onHybridToggle,
  onHybridNote,
  hybridHeadingRef,
}: {
  mode: "all" | "e" | "k";
  hybridOpen: boolean;
  formats: { e: ExplainerFormat; k: ExplainerFormat; h: ExplainerFormat };
  t: ExplainerTexts;
  onFormat: (k: "e" | "k") => void;
  onHybridToggle: () => void;
  onHybridNote: () => void;
  hybridHeadingRef: React.Ref<HTMLHeadingElement>;
}) {
  const id = useId();
  const hybridId = `${id}-hybrid`;

  if (mode !== "all") {
    const f = formats[mode];
    return (
      <div className={styles.explain} data-explainer="">
        <p className={ui.caps}>{t.journey}</p>
        <h2 className={styles.question}>{f.question}</h2>
        <p className={styles.definition} data-explainer-text="">
          {f.definition}
        </p>
        {f.steps && f.steps.length > 0 && <Steps items={f.steps} label={`${f.name}: ${t.journey}`} />}
        <p className={styles.note}>
          <span>{t.hybridNote}</span>
          <button type="button" className={`${ui.more} ${styles.noteLink}`} onClick={onHybridNote}>
            {formats.h.name}
          </button>
        </p>
      </div>
    );
  }

  const h = formats.h;
  return (
    <div className={styles.explain} data-explainer="">
      <p className={ui.caps}>{t.overview}</p>
      <div className={styles.cards}>
        {(["e", "k"] as const).map((k) => (
          <button key={k} type="button" className={styles.card} data-format-card={k} onClick={() => onFormat(k)}>
            <b className={styles.cardName}>{formats[k].name}</b>
            <span className={styles.cardText}>{formats[k].card}</span>
            <span className={styles.cardMore}>{t.howItWorks}</span>
          </button>
        ))}
        <button type="button" className={styles.card} data-format-card="h" aria-expanded={hybridOpen} aria-controls={hybridId} onClick={onHybridToggle}>
          <b className={styles.cardName}>{h.name}</b>
          <span className={styles.cardText}>{h.card}</span>
          <span className={`${styles.cardMore} ${styles.cardMoreToggle}`}>{t.readMore}</span>
        </button>
      </div>
      {/* Hybrid: the description only — no steps, facts or links (Maria C16). */}
      <div id={hybridId} className={styles.hybrid} data-hybrid-panel="" hidden={!hybridOpen}>
        {hybridOpen && (
          <>
            <h2 ref={hybridHeadingRef} className={styles.question} tabIndex={-1}>
              {h.question}
            </h2>
            <p className={styles.definition} data-explainer-text="">
              {h.definition}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
