import { paragraphs } from "@/domain/catalogue";
import styles from "./LegalPage.module.css";

/**
 * A stored legal text as paragraphs (a blank line starts a new one), in B's readable prose style: the one renderer of the
 * public legal pages (privacy, terms; LegalPage) and of the e-course terms notice in the account (TermsGate).
 */
export function LegalText({ text }: { text: string }) {
  return (
    <div className={styles.body} data-legal-body="">
      {paragraphs(text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
