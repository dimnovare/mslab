"use client";

import { useEffect, useRef, useState } from "react";
import ui from "@/components/site/ui.module.css";
import { paymentReference, type PrepaymentInfo as PaySettings } from "@/domain/account-cards";
import type { CoursesTexts } from "./texts";
import styles from "./PrepaymentInfo.module.css";

type Row = { key: string; label: string; value: string; copy?: boolean };

/** How long the pressed "Kopeeri" says "Kopeeritud ✓". */
const COPIED_MS = 2000;

/**
 * Where to pay the prepayment, opened in place under the card's "Vaata juhiseid" (spec 2.1 rule 5): receiver, IBAN, bank,
 * the amount (the card sentence's own, as nextStep formatted it) and the explanation `{referencePrefix}{registrationId}`,
 * then "Pärast makset kinnitab Maria su koha." A field the admin left empty is left out. IBAN and explanation have
 * "Kopeeri": copied, the pressed button itself says "Kopeeritud ✓" for a moment (both words share one cell, so it keeps
 * its width); where the browser gives no clipboard, the text is selected and a line says to copy it. A hidden live
 * region tells a screen reader either way.
 */
export function PrepaymentInfo({
  id,
  pay,
  registrationId,
  amount,
  t,
}: {
  id: string;
  pay: PaySettings;
  registrationId: number;
  amount: string | undefined;
  t: CoursesTexts["payment"];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);
  const [status, setStatus] = useState("");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const rows: Row[] = [
    { key: "receiver", label: t.receiver, value: pay.receiver },
    { key: "iban", label: t.iban, value: pay.iban, copy: true },
    { key: "bank", label: t.bank, value: pay.bank },
    { key: "amount", label: t.amount, value: amount ?? "" },
    { key: "reference", label: t.reference, value: paymentReference(pay, registrationId), copy: true },
  ].filter((row) => row.value.trim() !== "");

  const copy = async (row: Row, value: HTMLElement | null) => {
    window.clearTimeout(timer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(row.value);
      setCopied(row.key);
      setSelected(false);
      setStatus(`${t.copied}: ${row.label}`);
      timer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
    } catch {
      // No clipboard (an old browser, an insecure page, a refusal): select the text for the student to copy.
      const selection = window.getSelection();
      if (value && selection) selection.selectAllChildren(value);
      setCopied(null);
      setSelected(true);
      setStatus(t.selected);
    }
  };

  return (
    <div id={id} className={styles.panel} data-prepayment="">
      <dl className={styles.rows}>
        {rows.map((row) => (
          <div key={row.key} className={styles.row} data-pay-row={row.key}>
            <dt>{row.label}</dt>
            <dd>
              <span className={row.key === "amount" ? styles.amount : styles.value} data-pay-value="">
                {row.value}
              </span>
              {row.copy && (
                <button
                  type="button"
                  className={styles.copy}
                  onClick={(e) => copy(row, e.currentTarget.parentElement?.querySelector<HTMLElement>("[data-pay-value]") ?? null)}
                  aria-label={`${t.copy}: ${row.label}`}
                  data-pay-copy={row.key}
                  data-copied={copied === row.key || undefined}
                >
                  <span aria-hidden={copied === row.key}>{t.copy}</span>
                  <span aria-hidden={copied !== row.key}>{t.copied} ✓</span>
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.after}>{t.after}</p>
      {selected && (
        <p className={styles.selected} data-pay-selected="">
          {t.selected}
        </p>
      )}
      <p className={ui.srOnly} role="status" data-pay-status="">
        {status}
      </p>
    </div>
  );
}
