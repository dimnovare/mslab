"use client";

import { useEffect, useRef, useState } from "react";
import { paymentReference, type PrepaymentInfo as PaySettings } from "@/domain/account-cards";
import type { CoursesTexts } from "./texts";
import styles from "./PrepaymentInfo.module.css";

type Row = { key: string; label: string; value: string; copy?: boolean };

/** How long "Kopeeritud" / "Tekst on märgitud" stays. */
const STATUS_MS = 4000;

/**
 * Where to pay the prepayment, opened in place under the card's "Vaata juhiseid" (spec 2.1 rule 5): receiver, IBAN, bank,
 * the amount (the card sentence's own, as nextStep formatted it) and the explanation `{referencePrefix}{registrationId}`,
 * then "Pärast makset kinnitab Maria su koha." A field the admin left empty is left out. IBAN and explanation have
 * "Kopeeri": the clipboard, or where the browser gives none, the text is selected for the student to copy; either way a
 * short line says what happened (aria-live).
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
  const [status, setStatus] = useState<{ text: string; selected: boolean } | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const rows: Row[] = [
    { key: "receiver", label: t.receiver, value: pay.receiver },
    { key: "iban", label: t.iban, value: pay.iban, copy: true },
    { key: "bank", label: t.bank, value: pay.bank },
    { key: "amount", label: t.amount, value: amount ?? "" },
    { key: "reference", label: t.reference, value: paymentReference(pay, registrationId), copy: true },
  ].filter((row) => row.value.trim() !== "");

  const show = (text: string, selected: boolean) => {
    setStatus({ text, selected });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus(null), STATUS_MS);
  };

  const copy = async (row: Row, value: HTMLElement | null) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(row.value);
      show(t.copied, false);
    } catch {
      // No clipboard (an old browser, an insecure page, a refusal): select the text for the student to copy.
      const selection = window.getSelection();
      if (value && selection) selection.selectAllChildren(value);
      show(t.selected, true);
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
                >
                  {t.copy}
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.after}>{t.after}</p>
      <p className={status?.selected ? styles.selected : styles.status} role="status" data-pay-status="">
        {status?.text ?? ""}
      </p>
    </div>
  );
}
