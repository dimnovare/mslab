"use client";

import { useId, useState } from "react";
import { CourseCard, type CourseCardData } from "@/components/site/CourseCard";
import type { Badge } from "@/db/schema";
import { BADGE_MAX, BADGE_PRESETS, BADGE_SWATCHES, swatchOf, type SwatchId } from "@/domain/course-editor";
import { adminEt } from "@/i18n/dict/admin";
import ui from "./ui.module.css";
import styles from "./editor.module.css";

/**
 * Prototype D `adminBadges` ("Koolituse märgis", Maria C36 "Väga meeldib see blokk. Jätame."): quick labels or an own
 * text of up to 18 characters, a colour from D's swatches, and a live preview: the site's real course card with the
 * badge as it would look on the catalogue page. Only the swatches can be chosen (D's free colour picker is left out,
 * so every badge stays in the palette). `card`: the course's card without its badge.
 */
export function BadgeEditor({ value, onChange, card, error }: { value: Badge; onChange: (badge: Badge) => void; card: CourseCardData; error?: string }) {
  const t = adminEt.badge;
  const uid = useId();
  // the colour stays chosen while there is no label ("Puudub", then "Uus" keeps it)
  const [chosen, setChosen] = useState<SwatchId>(() => swatchOf(value) ?? "tint");
  const stored = value ? swatchOf(value) : null;
  const pressed = value ? stored : chosen;
  const label = value?.label ?? "";

  const withLabel = (text: string, swatch: SwatchId | null = pressed ?? chosen): Badge => {
    if (!text.trim()) return null;
    const s = BADGE_SWATCHES.find((x) => x.id === swatch) ?? BADGE_SWATCHES[0];
    return { label: text.slice(0, BADGE_MAX), bg: s.bg, fg: s.fg };
  };
  const pickSwatch = (id: SwatchId) => {
    setChosen(id);
    if (value) onChange(withLabel(value.label, id));
  };
  const shown: Badge = value && value.label.trim() ? value : null;

  return (
    <div className={styles.badge} data-badge-editor="">
      <div>
        <h2 className={ui.h3}>{t.title}</h2>
        <p className={`${ui.muted} ${ui.small}`}>{t.lead}</p>
      </div>

      <div className={styles.fieldset} role="group" aria-labelledby={`${uid}-presets`}>
        <p id={`${uid}-presets`} className={`${ui.legend} ${styles.groupLabel}`}>
          {t.presets}
        </p>
        <div className={styles.chips}>
          <button type="button" className={styles.chip} aria-pressed={!value} onClick={() => onChange(null)}>
            {t.none}
          </button>
          {BADGE_PRESETS.map((p) => (
            <button key={p} type="button" className={styles.chip} aria-pressed={value?.label === p} onClick={() => onChange(withLabel(p))}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className={ui.field}>
        <label htmlFor={`${uid}-own`}>{t.own}</label>
        <input
          id={`${uid}-own`}
          className={ui.input}
          type="text"
          maxLength={BADGE_MAX}
          value={label}
          placeholder={t.placeholder}
          autoComplete="off"
          onChange={(e) => onChange(withLabel(e.target.value))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${uid}-error` : undefined}
          data-badge-label=""
        />
      </div>

      <div className={styles.fieldset} role="group" aria-labelledby={`${uid}-colour`}>
        <p id={`${uid}-colour`} className={`${ui.legend} ${styles.groupLabel}`}>
          {t.colour}
        </p>
        <div className={styles.swatches}>
          {BADGE_SWATCHES.map((s) => (
            <button key={s.id} type="button" className={styles.swatch} aria-pressed={pressed === s.id} onClick={() => pickSwatch(s.id)} data-swatch={s.id}>
              <i style={{ background: s.bg }} aria-hidden="true" />
              {t.swatch[s.id]}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p id={`${uid}-error`} className={ui.error}>
          {error}
        </p>
      )}

      <div className={styles.preview} data-badge-preview="">
        <p className={ui.eyebrow}>{t.preview}</p>
        {/* inert: the preview is a picture of the card, not a second link to the course */}
        <div className={styles.previewCard} inert>
          <CourseCard c={{ ...card, badge: shown }} square sizes="300px" />
        </div>
        <p className={`${ui.muted} ${ui.small}`}>{t.previewNote}</p>
      </div>
    </div>
  );
}
