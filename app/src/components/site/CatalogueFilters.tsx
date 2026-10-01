"use client";

import { useEffect, useId, useRef, useState } from "react";
import { catalogueSearch, matchesCatalogue, type FormatFilter, type LevelFilter } from "@/domain/catalogue";
import { fill } from "@/i18n/format";
import { CourseCard, type CourseCardData } from "./CourseCard";
import { FormatExplainer, type ExplainerFormat, type ExplainerTexts } from "./FormatExplainer";
import { Icon } from "./Icon";
import ui from "./ui.module.css";
import styles from "./CatalogueFilters.module.css";

export type CatalogueCourse = { card: CourseCardData; level: "basic" | "advanced"; /** normalizeSearch(title + summary) */ text: string };

export type CatalogueTexts = ExplainerTexts & {
  search: string;
  formatLabel: string;
  levelLabel: string;
  filterAll: string;
  allLevels: string;
  levelBasic: string;
  levelAdvanced: string;
  emptyTitle: string;
  emptyText: string;
  resetFilters: string;
  results: string;
};

/**
 * Catalogue filters in prototype B's arrangement (Maria C17 / K3): format chips with the search on the first row,
 * the explainer, then the level chips on their own row (K4), then the course grid. Format and level live in the URL
 * (?vorm=e|k&tase=baas|taiend) so the home page links and a reload land on the same view; the server renders the
 * initial state, so the first paint is already filtered. Search (K13) filters title and summary.
 */
export function CatalogueFilters({
  courses,
  initial,
  formats,
  t,
}: {
  courses: CatalogueCourse[];
  initial: { vorm: FormatFilter; tase: LevelFilter; hybrid: boolean };
  formats: { e: ExplainerFormat; k: ExplainerFormat; h: ExplainerFormat };
  t: CatalogueTexts;
}) {
  const id = useId();
  const [vorm, setVorm] = useState<FormatFilter>(initial.vorm);
  const [tase, setTase] = useState<LevelFilter>(initial.tase);
  const [search, setSearch] = useState("");
  const [hybridOpen, setHybridOpen] = useState(initial.hybrid);
  const [focusHybrid, setFocusHybrid] = useState(0);
  const hybridHeading = useRef<HTMLHeadingElement>(null);

  // Keep ?vorm / ?tase in the address bar (Next.js syncs native replaceState with its router).
  const sync = (v: FormatFilter, l: LevelFilter) => {
    const params = new URLSearchParams(window.location.search);
    params.delete("vorm");
    params.delete("tase");
    const own = new URLSearchParams(catalogueSearch({ vorm: v, tase: l }).slice(1));
    own.forEach((value, key) => params.set(key, value));
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
  };

  const pickFormat = (v: FormatFilter) => {
    setVorm(v);
    setHybridOpen(false);
    sync(v, tase);
  };
  const pickLevel = (l: LevelFilter) => {
    setTase(l);
    sync(vorm, l);
  };
  // From a format's journey panel: hybrid means combining courses of both formats, so show all of them.
  const openHybridFromNote = () => {
    setVorm("all");
    setHybridOpen(true);
    setFocusHybrid((n) => n + 1);
    sync("all", tase);
  };
  const reset = () => {
    setVorm("all");
    setTase("all");
    setSearch("");
    setHybridOpen(false);
    sync("all", "all");
  };

  // The note button disappears with the panel it was in: move focus to the hybrid explanation instead.
  useEffect(() => {
    if (focusHybrid) hybridHeading.current?.focus();
  }, [focusHybrid]);

  const shown = courses.filter((c) => matchesCatalogue({ type: c.card.type, level: c.level, text: c.text }, { vorm, tase, search }));

  const formatChips: [FormatFilter, string][] = [
    ["all", t.filterAll],
    ["e", formats.e.name],
    ["k", formats.k.name],
  ];
  const levelChips: [LevelFilter, string][] = [
    ["all", t.allLevels],
    ["baas", t.levelBasic],
    ["taiend", t.levelAdvanced],
  ];

  return (
    <>
      <div className={styles.bar}>
        <div className={styles.pills} role="group" aria-label={t.formatLabel} data-filter-row="format">
          {formatChips.map(([v, label]) => (
            <button key={v} type="button" className={styles.pill} aria-pressed={vorm === v} onClick={() => pickFormat(v)}>
              {label}
            </button>
          ))}
        </div>
        <label className={styles.search}>
          <Icon name="search" size={18} />
          <span className={ui.srOnly}>{t.search}</span>
          <input type="search" value={search} placeholder={t.search} autoComplete="off" onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <FormatExplainer
        mode={vorm}
        hybridOpen={hybridOpen}
        formats={formats}
        t={t}
        onFormat={pickFormat}
        onHybridToggle={() => setHybridOpen((o) => !o)}
        onHybridNote={openHybridFromNote}
        hybridHeadingRef={hybridHeading}
      />

      <div className={`${styles.pills} ${styles.levels}`} role="group" aria-label={t.levelLabel} data-filter-row="level">
        {levelChips.map(([l, label]) => (
          <button key={l} type="button" className={styles.pill} aria-pressed={tase === l} onClick={() => pickLevel(l)}>
            {label}
          </button>
        ))}
      </div>

      <p className={ui.srOnly} aria-live="polite" id={`${id}-results`}>
        {fill(t.results, { n: shown.length })}
      </p>

      {shown.length > 0 ? (
        <div className={styles.grid}>
          {shown.map((c) => (
            <CourseCard key={c.card.id} c={c.card} square sizes="(max-width: 640px) 100vw, (max-width: 1180px) 50vw, 33vw" />
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{t.emptyTitle}</h2>
          <p>{t.emptyText}</p>
          <button type="button" className={ui.btnOutline} onClick={reset}>
            {t.resetFilters}
          </button>
        </div>
      )}
    </>
  );
}
