"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import ui from "@/components/site/ui.module.css";
import { href } from "@/i18n/href";
import { LOCALES, type Locale } from "@/i18n/locales";
import { DELETED_MARK, SAVED_MARK } from "@/lib/account-marks";
import type { ClientProfile, Dashboard } from "@/server/client-data";
import { AccountLoader, type Reload } from "./AccountLoader";
import { ACCOUNT_EVENT, forgetAccountMemory } from "./useAccount";
import type { DetailsTexts } from "./texts";
import choices from "./ChangeRequestDialog.module.css";
import page from "./CoursesTab.module.css";
import fields from "./LoginForm.module.css";
import bones from "./Skeleton.module.css";
import styles from "./DetailsTab.module.css";

/** The longest name and phone the API takes (server/account-input.ts). */
const NAME_MAX = 120;
const PHONE_MAX = 40;

/** A text field as the API stores it (account-input.ts `line`): inner whitespace one space, the ends trimmed. */
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();

/** A same-origin JSON request: its status (0 when there was no answer) and whether the body said `ok: true`. */
async function send(path: string, method: "POST" | "PATCH", body: object): Promise<{ status: number; ok: boolean }> {
  try {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok && (data as { ok?: unknown } | null)?.ok === true };
  } catch {
    return { status: 0, ok: false };
  }
}

/**
 * "Minu andmed" (/konto/andmed): the e-mail (the login's, not editable), name and phone (both optional) and the account's language
 * with one "Salvesta"; the newsletter switch, which saves at once; at the very bottom "Kustuta konto" with its one confirmation step.
 * The page itself is a static shell: AccountLoader loads the dashboard (GET /api/konto), whose `client` is the profile.
 */
export function DetailsTab({ locale, t }: { locale: Locale; t: DetailsTexts }) {
  return (
    <AccountLoader<Dashboard>
      path="/api/konto"
      locale={locale}
      t={{ ...t.loader, loading: t.loading }}
      skeleton={<DetailsSkeleton />}
      render={(data, reload) => <DetailsView client={data.client} locale={locale} t={t} reload={reload} />}
    />
  );
}

/** While the profile loads: the heading's stand-in and three fields. */
function DetailsSkeleton() {
  return (
    <div className={`${ui.wrap} ${page.page}`}>
      <div className={styles.column} aria-hidden="true">
        <span className={`${bones.bone} ${bones.title}`} />
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <span className={`${bones.bone} ${bones.label}`} />
            <span className={`${bones.bone} ${bones.field}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

type Status = { text: string; error: boolean } | null;

function DetailsView({ client, locale, t, reload }: { client: ClientProfile; locale: Locale; t: DetailsTexts; reload: Reload }) {
  const ids = { name: useId(), phone: useId(), question: useId() };
  const [name, setName] = useState(client.name);
  const [phone, setPhone] = useState(client.phone);
  const [language, setLanguage] = useState<Locale>(client.locale);
  /** The language the account has, as last saved: a save that changes it opens this tab in that language. */
  const [savedLanguage, setSavedLanguage] = useState<Locale>(client.locale);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Status>(null);

  const [newsletter, setNewsletter] = useState(client.newsletter);
  const [newsletterStatus, setNewsletterStatus] = useState<Status>(null);
  const newsletterBusy = useRef(false);

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const step = useRef<HTMLDivElement>(null);
  /** "Tühista" gives the focus back to "Kustuta konto" (opening the step does not move it there). */
  const backToDelete = useRef(false);

  // A language change opened this tab with #salvestatud: say "Salvestatud." here, once (a reload must not repeat it).
  useEffect(() => {
    if (window.location.hash !== `#${SAVED_MARK}`) return;
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address is only known in the browser, after the data has loaded
    setSaved({ text: t.saved, error: false });
  }, [t.saved]);

  // The confirmation step takes the focus when it opens (a screen reader reads its question); "Tühista" gives it back.
  useEffect(() => {
    if (confirming) step.current?.focus();
    else if (backToDelete.current) {
      backToDelete.current = false;
      deleteButton.current?.focus();
    }
  }, [confirming]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const profile = { name: oneLine(name), phone: oneLine(phone), locale: language };
    setSaving(true);
    setSaved(null);
    const answer = await send("/api/konto/andmed", "PATCH", profile);
    if (answer.ok && profile.locale !== savedLanguage && profile.locale !== locale) {
      // the same tab in the language just chosen, a full page load (the page's language, <html lang>, the header); "Salvestatud." is
      // said there, and the button stays busy until it opens
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load on purpose: another language's page
      window.location.assign(`${href(profile.locale, "/konto/andmed")}#${SAVED_MARK}`);
      return;
    }
    setSaving(false);
    if (answer.status === 401) return void reload({ quiet: true }); // signed out meanwhile: the page shows what is true now
    if (!answer.ok) return setSaved({ text: t.saveFailed, error: true });
    setName(profile.name);
    setPhone(profile.phone);
    setSavedLanguage(profile.locale);
    setSaved({ text: t.saved, error: false });
  };

  const switchNewsletter = async (on: boolean) => {
    if (newsletterBusy.current) return;
    newsletterBusy.current = true;
    setNewsletter(on);
    setNewsletterStatus(null);
    const answer = await send("/api/konto/uudiskiri", "POST", { on });
    newsletterBusy.current = false;
    if (answer.ok) return setNewsletterStatus({ text: t.saved, error: false });
    setNewsletter(!on);
    if (answer.status === 401) return void reload({ quiet: true });
    setNewsletterStatus({ text: t.saveFailed, error: true });
  };

  const cancelDelete = () => {
    if (deleting) return;
    backToDelete.current = true;
    setDeleteFailed(false);
    setConfirming(false);
  };

  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteFailed(false);
    const answer = await send("/api/konto/kustuta", "POST", { confirm: true });
    if (answer.ok) {
      // The answer cleared both cookies. This browser forgets the account too; the header says "Logi sisse"; the home page says it is done.
      forgetAccountMemory();
      window.dispatchEvent(new Event(ACCOUNT_EVENT));
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load on purpose: nothing of the account stays in memory
      window.location.assign(`${href(locale, "/")}#${DELETED_MARK}`);
      return;
    }
    setDeleting(false);
    if (answer.status === 401) return void reload({ quiet: true });
    setDeleteFailed(true);
  };

  const edited = () => setSaved(null);

  return (
    <div className={`${ui.wrap} ${page.page}`} data-account-details="">
      <div className={styles.column}>
        <h1 className={page.title}>{t.title}</h1>
        <p className={styles.email} data-account-email="">
          <span className={styles.emailLabel}>{t.email}</span>
          <span className={styles.emailValue}>{client.email}</span>
        </p>

        <form className={styles.form} onSubmit={save} noValidate>
          <div className={fields.field}>
            <label htmlFor={ids.name}>{t.name}</label>
            <input
              id={ids.name}
              name="name"
              autoComplete="name"
              maxLength={NAME_MAX}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                edited();
              }}
            />
          </div>
          <div className={fields.field}>
            <label htmlFor={ids.phone}>{t.phone}</label>
            <input
              id={ids.phone}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={PHONE_MAX}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                edited();
              }}
            />
          </div>
          <fieldset className={choices.choices}>
            <legend className={choices.question}>{t.language}</legend>
            {LOCALES.map((l) => (
              <label key={l} className={choices.choice} lang={l}>
                <input
                  type="radio"
                  name="language"
                  value={l}
                  checked={language === l}
                  onChange={() => {
                    setLanguage(l);
                    edited();
                  }}
                  data-language={l}
                />
                <span>{t.languages[l]}</span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className={ui.btn} aria-disabled={saving || undefined} data-details-save="">
            {t.save}
          </button>
          <p className={saved?.error ? fields.error : fields.status} role="status" data-details-status="">
            {saved?.text ?? ""}
          </p>
        </form>

        <div className={styles.newsletter}>
          <label className={styles.switchRow}>
            <span>{t.newsletter}</span>
            <input
              type="checkbox"
              role="switch"
              className={styles.switch}
              checked={newsletter}
              onChange={(e) => void switchNewsletter(e.target.checked)}
              data-details-newsletter=""
            />
          </label>
          <p className={newsletterStatus?.error ? fields.error : fields.status} role="status" data-details-newsletter-status="">
            {newsletterStatus?.text ?? ""}
          </p>
        </div>

        <div className={styles.danger}>
          {confirming ? (
            <div
              ref={step}
              className={styles.confirm}
              role="group"
              aria-labelledby={ids.question}
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelDelete();
              }}
              data-delete-confirm=""
            >
              <p id={ids.question} className={styles.question}>
                {t.deleteQuestion}
              </p>
              <div className={styles.answers}>
                <button type="button" className={`${ui.btn} ${styles.yes}`} onClick={() => void deleteAccount()} aria-disabled={deleting || undefined} data-delete-yes="">
                  {t.deleteYes}
                </button>
                <button type="button" className={ui.btnOutline} onClick={cancelDelete} aria-disabled={deleting || undefined} data-delete-no="">
                  {t.deleteNo}
                </button>
              </div>
              <p className={fields.error} role="alert" data-delete-failed="">
                {deleteFailed ? t.deleteFailed : ""}
              </p>
            </div>
          ) : (
            <button ref={deleteButton} type="button" className={styles.deleteLink} onClick={() => setConfirming(true)} data-delete-account="">
              {t.delete}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
