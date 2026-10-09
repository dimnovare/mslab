"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { NEWSLETTER_SIGNED_KEY, newsletterLanding, type NewsletterPopupView } from "@/domain/campaign";
import type { Locale } from "@/i18n/locales";
import { NewsletterForm, type NewsletterFormTexts } from "./NewsletterForm";
import { NewsletterPopupCard, POPUP_FORM_CLASS } from "./NewsletterPopupCard";
import { PopupDialog, usePopupOpen } from "./PopupDialog";

export type NewsletterPopupTexts = { close: string; form: NewsletterFormTexts };

/** Signed up from this browser's newsletter popup (localStorage "mslab-nl"): it is never shown here again. */
function signedUpHere(): boolean {
  try {
    return localStorage.getItem(NEWSLETTER_SIGNED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberSignUp(): void {
  try {
    localStorage.setItem(NEWSLETTER_SIGNED_KEY, "1");
  } catch {
    // blocked storage: the once-per-session rule still holds
  }
}

/**
 * The value of ?uudiskiri= in the address of this page load (the unsubscribe link lands on /?uudiskiri=loobutud, the old confirmation link on
 * /?uudiskiri=kinnitatud#kood=…), or
 * null. Read in the first client render, not in an effect: FlashNotice, which the page renders before the popup, takes the parameter out
 * of the address in its own effect, and that effect runs before the popup's. (The server renders nothing of the popup, so the render's
 * read of the address cannot make the two differ.)
 */
function landingOfThisLoad(): string | null {
  return typeof window === "undefined" ? null : newsletterLanding(window.location.search);
}

/**
 * The newsletter popup (phase 2c, spec 5): on the home page only, when it is the popup the admin shows, with the campaign popup's timing
 * and dialog (PopupDialog: 6 s, once per browser session), the admin's picture and texts, and the footer's sign-up form (e-mail,
 * "Liitu" and the line under it: the subscribe action, its honeypot and limits). After a sign-up "Aitäh, oled liitunud! Saatsime sulle
 * tervituskirja." takes the form's place, and this browser never sees the popup again. The welcome code is never here: it comes after
 * the confirmation (the welcome mail and the confirmed page).
 * A page load that arrives with ?uudiskiri= (the confirmation link's landing, any value) shows no popup: it would ask her to sign up over
 * the notice, with her code in it. "kinnitatud" also marks this browser as signed up (localStorage "mslab-nl"), like a sign-up here.
 */
export function NewsletterPopup({ n, locale, t }: { n: NewsletterPopupView; locale: Locale; t: NewsletterPopupTexts }) {
  const [landed] = useState(landingOfThisLoad);
  useEffect(() => {
    if (landed === "kinnitatud") rememberSignUp();
  }, [landed]);
  const skip = useCallback(() => landed !== null || signedUpHere(), [landed]);
  const [open, close] = usePopupOpen(n.image, skip);
  return open ? <NewsletterDialog n={n} locale={locale} t={t} onClose={close} /> : null;
}

function NewsletterDialog({ n, locale, t, onClose }: { n: NewsletterPopupView; locale: Locale; t: NewsletterPopupTexts; onClose: () => void }) {
  const titleId = useId();
  return (
    <PopupDialog name="newsletter" titleId={titleId} closeLabel={t.close} onClose={onClose}>
      {(close) => <NewsletterPopupCard n={n} titleId={titleId} close={close} form={<NewsletterForm locale={locale} t={t.form} onSent={rememberSignUp} className={POPUP_FORM_CLASS} />} />}
    </PopupDialog>
  );
}
