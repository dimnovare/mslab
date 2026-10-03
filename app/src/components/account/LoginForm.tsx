"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/site/Icon";
import ui from "@/components/site/ui.module.css";
import { isEmail, normalizeEmail, typoSuggestion } from "@/domain/email";
import type { Dict } from "@/i18n/dict/et";
import { fill } from "@/i18n/format";
import type { Locale } from "@/i18n/locales";
import { rememberEmail, rememberedEmail } from "./useAccount";
import styles from "./LoginForm.module.css";

export type LoginTexts = Dict["account"]["login"] & { title: string; badEmail: string };

/** "Saada uus kood" waits this long after a code was sent (spec 5). */
export const RESEND_AFTER_MS = 60_000;
/**
 * The code step is kept for a reload within this time: the code's 30 minutes (server/client-auth.ts LOGIN_TTL_MS) less a
 * minute, because `sentAt` is stamped when the answer arrives, a little after the server issued the code.
 */
const KEEP_CODE_STEP_MS = 29 * 60_000;
/** sessionStorage key of the code step in this tab: `{ sentTo, sentAt }`. */
export const PENDING_KEY = "mslab-login-code";

type SendError = "email" | "rate" | "server";
/** `short`: Enter (a phone's "Go") with fewer than six digits. */
type CodeError = "short" | "code" | "expired" | "rate" | "server";
type FocusTarget = "email" | "code" | "resend" | "typo";
type Pending = { sentTo: string; sentAt: number };

/** A same-origin JSON POST: its status (0 when there was no answer) and its body ({} when it is not JSON). */
async function post(path: string, body: object): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => null);
    return { status: res.status, data: typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {} };
  } catch {
    return { status: 0, data: {} };
  }
}

/**
 * The code step this tab is in, when a code went out less than 30 minutes ago: a phone that dropped the tab (or a reload)
 * opens the login page at the code field again. Null when there is none, it is older, or storage is blocked.
 */
function pendingCode(now: number): Pending | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null");
    if (typeof value !== "object" || value === null) return null;
    const { sentTo, sentAt } = value as Record<string, unknown>;
    if (typeof sentTo !== "string" || !isEmail(sentTo) || typeof sentAt !== "number") return null;
    return now >= sentAt && now - sentAt < KEEP_CODE_STEP_MS ? { sentTo, sentAt } : null;
  } catch {
    return null;
  }
}

/** Keeps (or, with null, forgets) the code step of this tab; silently nothing when storage is blocked. */
function keepPendingCode(pending: Pending | null): void {
  try {
    if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // private mode or blocked storage: a reload simply starts at the e-mail again
  }
}

const noSubscription = () => () => {};

/** A dictionary sentence with one placeholder, the value in bold: "Saatsime … aadressile <b>{email}</b>." */
function withBold(template: string, name: string, value: string): React.ReactNode {
  const [before, after = ""] = template.split(`{${name}}`);
  return (
    <>
      {before}
      <b>{value}</b>
      {after}
    </>
  );
}

/**
 * The login page (/konto/sisene, spec 2.1 rules 1, 3, 8): the e-mail → "Saada kood" → the 6-digit code from the e-mail →
 * "Logi sisse". No password and no other step.
 *
 * - The field starts with the last e-mail used in this browser; the address is trimmed and lower-cased, and a common
 *   domain typo ("gmial.com") asks "Kas mõtlesid …?" first: "Jah, paranda" corrects it and sends, "Ei, saada nii" sends as typed.
 * - The code step says where the code went and has one primary button, "Logi sisse", enabled at six digits; the sixth digit
 *   also signs in by itself. Enter with fewer digits says "Sisesta kõik 6 numbrit.". Below: the spam-folder hint (the answer
 *   is the same whether or not a mail went out), then two quiet text buttons, "Saada uus kood" (after 60 s; until then
 *   the seconds left, as text) and "Muuda e-posti".
 * - The code step is kept in this tab (sessionStorage) for the code's 30 minutes: a phone that drops the tab while the
 *   student reads the e-mail comes back to the code field, with the rest of the 60 s.
 * - The page is static and the same for every visitor; the browser reads its query: `?viga=link` (the e-mail's button was
 *   used or too old) and `?viga=server` show a notice above the form, `?korda=1` (from "Saada uus kood" on an account page)
 *   sends a code to the remembered e-mail at once. The parameters are then removed from the address, so a reload does
 *   not repeat them.
 * - The page's language goes with the login (the account a first login creates speaks it); signed in, the browser opens
 *   "Minu konto" in that language, in place of the login page in the history.
 */
export function LoginForm({ locale, t }: { locale: Locale; t: LoginTexts }) {
  const id = useId();
  // false in the server's HTML and while it hydrates, true once this form handles its own submit: before that a tap posts
  // the plain form (method="post", nothing in the address) and the page simply opens again. `data-login-ready` says so.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [banner, setBanner] = useState<"link" | "server" | null>(null);
  const [typo, setTypo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<SendError | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [codeError, setCodeError] = useState<CodeError | null>(null);
  const [resent, setResent] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);

  // One request at a time (a double tap, the sixth digit and Enter): a ref, so a second call in the same tick sees it.
  const busy = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const resendRef = useRef<HTMLButtonElement>(null);
  const typoRef = useRef<HTMLButtonElement>(null);
  // Where the focus goes once the render that shows it is on screen: kept until that element exists (an effect may run
  // before the state that shows it has rendered, as Strict Mode's second run in development does).
  const focusAfterRender = useRef<FocusTarget | null>(null);
  useEffect(() => {
    const target = focusAfterRender.current;
    const element = target && { email: emailRef, code: codeRef, resend: resendRef, typo: typoRef }[target].current;
    if (!element) return;
    focusAfterRender.current = null;
    element.focus();
  });

  /** Opens the code step for `address`, the code sent at `sentAt`. */
  function showCodeStep(address: string, sentAt: number): void {
    setNow(Date.now());
    setResendAt(sentAt + RESEND_AFTER_MS);
    setSentTo(address);
    setEmail(address);
    setStep("code");
    setCode("");
    setCodeError(null);
    setSendError(null);
    setTypo(null);
    setBanner(null);
    focusAfterRender.current = "code";
  }

  /** Asks for a code for `address`: on success the code step (again, for a resend), else the error where it belongs. */
  async function send(address: string, again = false): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    const { status, data } = await post("/api/konto/login", { email: address, locale });
    busy.current = false;
    setSending(false);
    if (status === 200 && data.ok === true) {
      const sentAt = Date.now();
      rememberEmail(address);
      keepPendingCode({ sentTo: address, sentAt });
      showCodeStep(address, sentAt);
      setResent(again);
      return;
    }
    const error: SendError = status === 400 && data.error === "email" ? "email" : status === 429 ? "rate" : "server";
    if (again) {
      setCodeError(error === "rate" ? "rate" : "server");
      focusAfterRender.current = "resend";
    } else {
      setTypo(null);
      setSendError(error);
      focusAfterRender.current = "email";
    }
  }

  /** The six digits: signs in and opens "Minu konto", or says what to do. */
  async function verify(digits: string): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setCodeError(null);
    setResent(false);
    // the page's language: an account this login creates speaks it (an existing one keeps its own)
    const { status, data } = await post("/api/konto/code", { email: sentTo, code: digits, locale });
    if (status === 200 && data.ok === true) {
      keepPendingCode(null);
      // The field stays as it is while the page opens. replace, not assign: Back from "Minu konto" goes to the page before
      // the login, never to a code that is used up (nor to this form as it was left, from the browser's page cache).
      window.location.replace(locale === "ru" ? "/ru/konto" : "/konto");
      return;
    }
    busy.current = false;
    setChecking(false);
    const error: CodeError =
      status === 400 && data.error === "code" ? "code" : status === 400 && data.error === "expired" ? "expired" : status === 429 ? "rate" : "server";
    setCodeError(error);
    if (error === "code" || error === "expired") setCode(""); // a wrong or dead code is typed again; after a failure of ours "Logi sisse" tries the same one
    if (error === "expired") {
      keepPendingCode(null); // the server says the code is dead: a reload must not bring its step back
      setResendAt(0); // a new code is the only way on: "Saada uus kood" works at once and has the focus
      focusAfterRender.current = "resend";
    } else focusAfterRender.current = "code";
  }

  /** "Logi sisse", Enter or a phone's "Go": the code when it has six digits, else the hint, the focus kept in the field. */
  const submitCode = () => {
    if (busy.current) return;
    if (code.length === 6) {
      void verify(code);
      return;
    }
    setCodeError("short");
    focusAfterRender.current = "code";
  };

  // The page's query, the remembered e-mail and a code step of this tab exist in the browser only: read once after
  // hydration (once per mount: Strict Mode runs the effect twice in development).
  const arrived = useRef(false);
  const arrive = useEffectEvent(() => {
    if (arrived.current) return;
    arrived.current = true;
    const saved = rememberedEmail();
    const url = new URL(window.location.href);
    const problem = url.searchParams.get("viga");
    const again = url.searchParams.get("korda") === "1";
    if (url.searchParams.has("viga") || url.searchParams.has("korda")) {
      url.searchParams.delete("viga");
      url.searchParams.delete("korda");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
    if (saved) setEmail((typed) => typed || saved);
    if (problem === "link" || problem === "server") {
      keepPendingCode(null); // a code step kept in this tab belongs to a send the notice says to replace
      setBanner(problem); // the notice belongs to the e-mail step: a new code is what it asks for
      return;
    }
    if (again && saved) {
      void send(saved);
      return;
    }
    const pending = pendingCode(Date.now());
    if (pending) showCodeStep(pending.sentTo, pending.sentAt);
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the address and the storage are only known in the browser, after hydration
    arrive();
  }, []);

  // "Uue koodi saad saata 45 s pärast.": the seconds count down while the code step waits.
  useEffect(() => {
    if (step !== "code" || resendAt === 0) return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, resendAt]);

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    const address = normalizeEmail(email);
    setEmail(address);
    if (!isEmail(address)) {
      setTypo(null);
      setSendError("email");
      focusAfterRender.current = "email";
      return;
    }
    const fixed = typoSuggestion(address);
    if (fixed) {
      setSendError(null);
      setTypo(fixed);
      focusAfterRender.current = "typo";
      return;
    }
    void send(address);
  };

  const typeCode = (raw: string) => {
    if (checking) return;
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (codeError) setCodeError(null);
    if (resent) setResent(false);
    if (digits.length === 6) void verify(digits);
  };

  const changeEmail = () => {
    keepPendingCode(null);
    setStep("email");
    setEmail(sentTo);
    setCode("");
    setCodeError(null);
    setResent(false);
    focusAfterRender.current = "email";
  };

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const sendErrorText = sendError === "email" ? t.badEmail : sendError === "rate" ? t.rate : sendError === "server" ? t.server : "";
  const codeMessage = codeError
    ? { short: t.allDigits, code: t.wrongCode, expired: t.expired, rate: t.rate, server: t.server }[codeError]
    : resent
      ? t.resent
      : "";
  const messageClass = codeError === "short" ? styles.note : codeError ? styles.error : styles.status;

  return (
    <section className={styles.page} data-login-step={step} data-login-ready={hydrated ? "" : undefined}>
      <div className={styles.box}>
        <h1 className={styles.title}>{t.title}</h1>

        {step === "email" ? (
          <form method="post" noValidate onSubmit={submitEmail} data-login-email="">
            {banner && (
              <p className={styles.notice} role="status" data-login-banner={banner}>
                {banner === "link" ? t.linkExpired : t.server}
              </p>
            )}
            <div className={styles.field}>
              <label htmlFor={`${id}-email`}>{t.email}</label>
              <input
                ref={emailRef}
                id={`${id}-email`}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setTypo(null);
                  setSendError(null);
                }}
                aria-invalid={sendError === "email" ? true : undefined}
                aria-describedby={`${id}-email-message`}
              />
              <p id={`${id}-email-message`} className={styles.error} aria-live="polite">
                {sendErrorText}
              </p>
            </div>
            {typo ? (
              <div className={styles.typo} role="group" aria-labelledby={`${id}-typo`} data-login-typo="">
                <p id={`${id}-typo`}>{withBold(t.typo, "fixed", typo)}</p>
                <div className={styles.choices}>
                  <button
                    ref={typoRef}
                    type="button"
                    className={ui.btn}
                    aria-disabled={sending || undefined}
                    onClick={() => {
                      setEmail(typo);
                      void send(typo);
                    }}
                  >
                    {t.typoYes}
                  </button>
                  <button type="button" className={ui.btnOutline} aria-disabled={sending || undefined} onClick={() => void send(normalizeEmail(email))}>
                    {t.typoNo}
                  </button>
                </div>
              </div>
            ) : (
              <button type="submit" className={`${ui.btn} ${ui.btnFull}`} aria-disabled={sending || undefined}>
                {t.send}
                <Icon name="arrow" />
              </button>
            )}
          </form>
        ) : (
          <form
            method="post"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submitCode();
            }}
            data-login-code=""
          >
            <p id={`${id}-sent`} className={styles.lead}>
              {withBold(t.sent, "email", sentTo)}
            </p>
            <div className={styles.field}>
              <label htmlFor={`${id}-code`}>{t.code}</label>
              <input
                ref={codeRef}
                id={`${id}-code`}
                className={styles.code}
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                enterKeyHint="go"
                maxLength={6}
                value={code}
                readOnly={checking}
                onChange={(e) => typeCode(e.target.value)}
                // Enter / "Go": handled here, since the form's own Enter does nothing while "Logi sisse" is disabled
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  submitCode();
                }}
                // a pasted "123 456" is the code too (maxLength would cut it to "123 45")
                onPaste={(e) => {
                  e.preventDefault();
                  typeCode(e.clipboardData.getData("text"));
                }}
                aria-invalid={codeError === "code" || codeError === "expired" ? true : undefined}
                aria-describedby={`${id}-sent ${id}-code-message`}
                aria-busy={checking || undefined}
              />
              <p id={`${id}-code-message`} className={messageClass} aria-live="polite">
                {codeMessage}
              </p>
            </div>
            <button type="submit" className={`${ui.btn} ${ui.btnFull}`} disabled={code.length < 6 || checking}>
              {t.submit}
              <Icon name="arrow" />
            </button>
            <p className={styles.hint}>{t.spam}</p>
            <div className={styles.actions}>
              {secondsLeft > 0 ? (
                <p className={styles.wait} data-login-wait="">
                  {fill(t.resendIn, { s: secondsLeft })}
                </p>
              ) : (
                <button ref={resendRef} type="button" className={styles.textButton} aria-disabled={sending || undefined} onClick={() => void send(sentTo, true)}>
                  {t.resend}
                </button>
              )}
              <button type="button" className={styles.textButton} onClick={changeEmail}>
                {t.changeEmail}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
