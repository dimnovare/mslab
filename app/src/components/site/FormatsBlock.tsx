"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { Steps, type Step } from "./Steps";
import ui from "./ui.module.css";
import styles from "./FormatsBlock.module.css";

export type FormatTab = {
  key: string;
  name: string;
  question: string;
  definition: string;
  /** Hybrid has none of these: it is only an explanation (Maria C16, K1, K8). */
  facts?: string[];
  steps?: Step[];
  link?: { label: string; href: string };
};

/**
 * Prototype D "Kuidas soovid õppida?" (pHome + fmtPanel, Maria C24 / H7): tabs E-õpe / Kontaktõpe / Hübriidõpe.
 * Only the selected panel is rendered; the hybrid panel is the description alone (K8).
 */
export function FormatsBlock({
  t,
  tabs,
}: {
  t: { eyebrow: string; title: string; lead: string; tabsLabel: string; stepsLabel: string };
  tabs: FormatTab[];
}) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tab = tabs[selected];

  const select = (i: number, focus = false) => {
    const n = (i + tabs.length) % tabs.length;
    setSelected(n);
    if (focus) tabRefs.current[n]?.focus();
  };

  // WAI-ARIA tabs: arrows move between tabs (automatic activation), Home / End jump to the ends.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: selected + 1, ArrowLeft: selected - 1, Home: 0, End: tabs.length - 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    select(keys[e.key], true);
  };

  return (
    <section className={styles.fmt} aria-labelledby={`${id}-title`}>
      <div className={ui.wrap}>
        <div className={styles.head}>
          <p className={ui.caps}>{t.eyebrow}</p>
          <h2 id={`${id}-title`} className={ui.h2}>
            {t.title}
          </h2>
          <p className={`${ui.lead} ${styles.lead}`}>{t.lead}</p>
          <div className={styles.seg} role="tablist" aria-label={t.tabsLabel} onKeyDown={onKeyDown}>
            {tabs.map((f, i) => (
              <button
                key={f.key}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-tab-${f.key}`}
                aria-selected={i === selected}
                aria-controls={`${id}-panel`}
                tabIndex={i === selected ? 0 : -1}
                onClick={() => select(i)}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.panel} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab.key}`}>
          <div className={styles.def}>
            <div>
              <h3 className={styles.question}>{tab.question}</h3>
              {tab.facts && tab.facts.length > 0 && (
                <div className={styles.facts}>
                  {tab.facts.map((x) => (
                    <span key={x} className={styles.fact}>
                      {x}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className={styles.definition}>{tab.definition}</p>
              {tab.link && (
                <p className={styles.linkRow}>
                  <Link className={ui.more} href={tab.link.href}>
                    {tab.link.label}
                  </Link>
                </p>
              )}
            </div>
          </div>
          {tab.steps && tab.steps.length > 0 && <Steps items={tab.steps} label={`${tab.name}: ${t.stepsLabel}`} />}
        </div>
      </div>
    </section>
  );
}
