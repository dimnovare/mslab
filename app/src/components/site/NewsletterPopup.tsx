"use client";

import { useId } from "react";
import { NEWSLETTER_SIGNED_KEY, type NewsletterPopupView } from "@/domain/campaign";
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
 * The newsletter popup (phase 2c, spec 5): on the home page only, when it is the popup the admin shows, with the campaign popup's timing
 * and dialog (PopupDialog: 6 s, once per browser session), the admin's picture and texts, and the footer's sign-up form (e-mail,
 * "Liitu" and the line under it: the subscribe action, its honeypot and limits). After a sign-up "Saatsime sulle kinnituslingi. Ava see
 * oma postkastis." takes the form's place, and this browser never sees the popup again. The welcome code is never here: it comes after
 * the confirmation (the welcome mail and the confirmed page).
 */
export function NewsletterPopup({ n, locale, t }: { n: NewsletterPopupView; locale: Locale; t: NewsletterPopupTexts }) {
  const [open, close] = usePopupOpen(n.image, signedUpHere);
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
