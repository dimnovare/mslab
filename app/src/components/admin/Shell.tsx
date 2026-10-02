import { adminEt } from "@/i18n/dict/admin";
import { fill } from "@/i18n/format";
import { adminFirstName } from "@/server/auth";
import { getAdminCounts } from "./data";
import { ReadyMark } from "./ReadyMark";
import { SECTIONS, type Section } from "./sections";
import { Sidebar, type NavItem } from "./Sidebar";
import styles from "./Shell.module.css";

/**
 * Prototype B `adminShell()`: the dark sidebar on the left, the main column with the top line ("MS LAB ·
 * Halduskeskkond" and who is signed in) and the page. Every admin page renders it (pages call requireAdmin() first and
 * pass the e-mail), so the menu badges are fresh on every page: open registrations and requests.
 */
export async function Shell({ email, active, children }: { email: string; active: Section; children: React.ReactNode }) {
  const counts = await getAdminCounts();
  const t = adminEt.shell;
  const openRequests = Object.values(counts.openRequests).reduce((a, b) => a + b, 0);
  const badges: Partial<Record<Section, NavItem["badge"]>> = {
    registrations: counts.awaitingPrepayment ? { n: counts.awaitingPrepayment, label: fill(t.badgeRegistrations, { n: counts.awaitingPrepayment }) } : undefined,
    requests: openRequests ? { n: openRequests, label: fill(t.badgeRequests, { n: openRequests }) } : undefined,
  };
  const items: NavItem[] = SECTIONS.map((s) => ({ ...s, label: adminEt.nav[s.key], badge: badges[s.key] }));
  const name = adminFirstName(email);

  return (
    <div className={styles.layout}>
      <ReadyMark />
      <a href="#main" className={styles.skip}>
        {t.skip}
      </a>
      <Sidebar
        items={items}
        active={active}
        total={counts.awaitingPrepayment + openRequests}
        t={{
          label: t.label,
          nav: t.nav,
          home: t.home,
          openMenu: t.openMenu,
          closeMenu: t.closeMenu,
          viewSite: t.viewSite,
          newWindow: t.newWindow,
          logout: t.logout,
        }}
      />
      <main id="main" className={styles.main} tabIndex={-1}>
        <div className={styles.top}>
          <span>{t.top}</span>
          <span className={styles.who} title={fill(t.signedInAs, { email })}>
            <span className={styles.whoName}>{name}</span>
            <span className={styles.avatar} aria-hidden="true">
              {name.charAt(0)}
            </span>
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}
