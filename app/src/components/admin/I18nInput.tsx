"use client";

import { useId, useState } from "react";
import type { I18n } from "@/i18n/field";
import { adminEt } from "@/i18n/dict/admin";
import { fill } from "@/i18n/format";
import ui from "./ui.module.css";
import styles from "./editor.module.css";

export type Lang = "et" | "ru";

const hasRu = (v: I18n) => Boolean(v.ru && v.ru.trim());
/** An Estonian text without its Russian translation (an empty field is not "missing" anything yet). */
const lacksRu = (v: I18n) => Boolean(v.et.trim()) && !hasRu(v);

/**
 * ET / RU switch: two pills. RU carries "tõlge tulekul" while the translation is missing (only the admin sees this;
 * the public site shows the Estonian text instead).
 */
export function LangSwitch({ lang, onChange, label, missingRu }: { lang: Lang; onChange: (l: Lang) => void; label: string; missingRu: boolean }) {
  const t = adminEt.i18n;
  return (
    <span className={styles.langs} role="group" aria-label={fill(t.switch, { label })} data-lang-switch="">
      {(["et", "ru"] as const).map((l) => (
        <button key={l} type="button" className={styles.lang} aria-pressed={lang === l} onClick={() => onChange(l)} data-lang={l}>
          {t.lang[l]}
          {l === "ru" && missingRu && <span className={styles.missing}>{t.missing}</span>}
        </button>
      ))}
    </span>
  );
}

type Props = {
  label: string;
  value: I18n;
  onChange: (value: I18n) => void;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
  error?: string;
  placeholder?: string;
  /** Shared language (ListEditor: one switch for all rows); without it each field has its own switch. */
  lang?: Lang;
  onLangChange?: (l: Lang) => void;
  /** The label only for screen readers (list rows). */
  labelHidden?: boolean;
  /** data-i18n attribute (tests, the first-error focus). */
  name?: string;
};

/**
 * A content field in two languages ({ et, ru? }): the Estonian text is the one the site always has; the Russian one is
 * optional. One language is edited at a time; the RU field shows the Estonian text as its placeholder, which is what
 * the Russian page shows while the translation is missing.
 */
export function I18nInput({ label, value, onChange, multiline, rows = 4, maxLength, hint, error, placeholder, lang: shared, onLangChange, labelHidden, name }: Props) {
  const uid = useId();
  const [own, setOwn] = useState<Lang>("et");
  const lang = shared ?? own;
  const setLang = onLangChange ?? setOwn;
  const t = adminEt.i18n;
  const inputId = `${uid}-${lang}`;
  // the "missing translation" line under the field (list rows have it on their shared switch instead)
  const showMissing = lang === "ru" && lacksRu(value) && !labelHidden;
  const describedBy = [hint ? `${uid}-hint` : "", error ? `${uid}-error` : "", showMissing ? `${uid}-missing` : ""].filter(Boolean).join(" ") || undefined;
  const text = (lang === "ru" ? value.ru : value.et) ?? "";
  const set = (v: string) => onChange(lang === "ru" ? { ...value, ru: v } : { ...value, et: v });
  const common = {
    id: inputId,
    value: text,
    maxLength,
    placeholder: lang === "ru" ? value.et || placeholder : placeholder,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    lang,
    "data-i18n": name,
    "data-lang-field": lang,
  } as const;

  return (
    <div className={styles.i18n}>
      <div className={styles.i18nHead}>
        <label htmlFor={inputId} className={labelHidden ? ui.sr : styles.label}>
          {label}
          <span className={ui.sr}> ({t.langName[lang]})</span>
        </label>
        {!shared && <LangSwitch lang={lang} onChange={setLang} label={label} missingRu={lacksRu(value)} />}
      </div>
      {multiline ? (
        <textarea {...common} className={ui.textarea} rows={rows} onChange={(e) => set(e.target.value)} />
      ) : (
        <input {...common} className={ui.input} type="text" autoComplete="off" onChange={(e) => set(e.target.value)} />
      )}
      {hint && (
        <p id={`${uid}-hint`} className={ui.hint}>
          {hint}
        </p>
      )}
      {showMissing && (
        <p id={`${uid}-missing`} className={ui.hint}>
          {t.missingHint}
        </p>
      )}
      {error && (
        <p id={`${uid}-error`} className={ui.error}>
          {error}
        </p>
      )}
    </div>
  );
}
