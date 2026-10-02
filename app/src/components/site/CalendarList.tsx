"use client";

import { citySlug, parseCity } from "@/domain/calendar";
import { fill } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { useUrlQuery } from "@/lib/url-query";
import { CalendarRow, type CalendarRowData, type CalendarRowTexts } from "./CalendarRow";
import ui from "./ui.module.css";
import styles from "./Calendar.module.css";

export type CalendarTexts = CalendarRowTexts & {
  all: string;
  cityLabel: string;
  allCities: string;
  results: string;
  empty: string;
  none: string;
};

/**
 * Prototype A calendar: city chips Kõik / Pärnu / Tallinn / Tartu / Viljandi (L5) above the rows.
 * The URL is the single source of truth (as the catalogue filters): the city is read from ?linn=parnu|… with
 * useUrlQuery, so links, reload and Back show what the address says. A chip writes the address in place
 * (history.replaceState, no server round trip); other parameters are kept.
 */
export function CalendarList({ rows, cities, locale, t }: { rows: CalendarRowData[]; cities: string[]; locale: Locale; t: CalendarTexts }) {
  const [params, writeQuery] = useUrlQuery();
  const city = parseCity(params.get("linn"), cities);

  const pick = (key: string | null) => {
    const live = new URLSearchParams(window.location.search);
    if (key) live.set("linn", key);
    else live.delete("linn");
    writeQuery(live);
  };

  const shown = city ? rows.filter((r) => r.cityKey === city) : rows;
  const chips: [string | null, string][] = [[null, t.all], ...cities.map((c): [string, string] => [citySlug(c), c])];

  return (
    <>
      <div className={styles.chips} role="group" aria-label={t.cityLabel} data-city-filter="">
        {chips.map(([key, label]) => (
          <button key={key ?? "all"} type="button" className={styles.chip} aria-pressed={city === key} onClick={() => pick(key)}>
            {label}
          </button>
        ))}
      </div>

      <p className={ui.srOnly} aria-live="polite">
        {fill(t.results, { n: shown.length })}
      </p>

      {shown.length > 0 ? (
        <ul className={styles.list}>
          {shown.map((r) => (
            <CalendarRow key={r.id} row={r} locale={locale} t={t} />
          ))}
        </ul>
      ) : (
        <div className={styles.empty} data-calendar-empty="">
          <p>{rows.length === 0 ? t.none : t.empty}</p>
          {rows.length > 0 && (
            <button type="button" className={ui.btnOutline} onClick={() => pick(null)}>
              {t.allCities}
            </button>
          )}
        </div>
      )}
    </>
  );
}
