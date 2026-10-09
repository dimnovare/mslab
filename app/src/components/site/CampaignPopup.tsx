"use client";

import { useId, useState } from "react";
import type { CampaignView } from "@/domain/campaign";
import type { Locale } from "@/i18n/locales";
import { CampaignCard } from "./CampaignCard";
import { PopupDialog, usePopupOpen } from "./PopupDialog";

export type CampaignPopupTexts = { close: string; copy: string; copied: string; selected: string };

/**
 * The campaign popup (prototype D `campHtml` / `maybeAutoCampaign`, Maria C37: "Sellise kampaania lahendus mulle meeldib"). Rendered by
 * the home page only (/ and /ru), when the campaign is the popup shown. Its timing and dialog are PopupDialog's (6 s, once per browser
 * session; shared with the newsletter popup); here are the card and the copy button by the code.
 */
export function CampaignPopup({ c, locale, t }: { c: CampaignView; locale: Locale; t: CampaignPopupTexts }) {
  const [open, close] = usePopupOpen(c.image);
  return open ? <CampaignDialog c={c} locale={locale} t={t} onClose={close} /> : null;
}

function CampaignDialog({ c, locale, t, onClose }: { c: CampaignView; locale: Locale; t: CampaignPopupTexts; onClose: () => void }) {
  const titleId = useId();
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState("");

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(c.code);
      setCopied(true);
      setStatus(t.copied);
    } catch {
      // No clipboard (an old browser, an insecure page, a refusal): select the code for the visitor to copy.
      const code = document.querySelector("[data-campaign-popup] [data-campaign-code]");
      const selection = window.getSelection();
      if (code && selection) selection.selectAllChildren(code);
      setStatus(t.selected);
    }
  };

  return (
    <PopupDialog name="campaign" titleId={titleId} closeLabel={t.close} status={status} onClose={onClose}>
      {(close) => (
        <CampaignCard
          c={c}
          locale={locale}
          titleId={titleId}
          close={close}
          codeAction={
            <button type="button" onClick={copy} data-campaign-copy="">
              {copied ? t.copied : t.copy}
            </button>
          }
        />
      )}
    </PopupDialog>
  );
}
