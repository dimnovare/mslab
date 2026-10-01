import { adminEt } from "@/i18n/dict/admin";
import { fill } from "@/i18n/format";
import { adminFirstName, requireAdmin } from "@/server/auth";
import styles from "./panel.module.css";

// Placeholder until the admin shell (next task): who is signed in, and the logout button.
export default async function AdminHome() {
  const email = await requireAdmin();
  const t = adminEt.panel;
  return (
    <main className={styles.main}>
      <h1 className={styles.hello}>{fill(t.hello, { name: adminFirstName(email) })}</h1>
      <form method="post" action="/api/auth/logout">
        <button className={styles.logout} type="submit">
          {t.logout}
        </button>
      </form>
    </main>
  );
}
