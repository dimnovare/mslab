import { redirect } from "next/navigation";
import { Logo } from "@/components/site/Logo";
import { adminEt } from "@/i18n/dict/admin";
import { currentAdminEmail } from "@/server/auth";
import { LoginForm } from "./LoginForm";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** /admin/login: asks for an e-mail address and sends the login link. ?viga=link / =server: the link did not work. */
export default async function LoginPage({ searchParams }: Props) {
  // Already signed in: straight to the panel. A failing database must not hide the login page.
  if (await currentAdminEmail().catch(() => null)) redirect("/admin");
  const { viga } = await searchParams;
  const t = adminEt.login;
  const notice = viga === "link" ? t.errorLink : viga === "server" ? t.errorServer : undefined;
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Logo href="/" label={t.back} className={styles.logo} eager />
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.lead}>{t.lead}</p>
        <LoginForm
          notice={notice}
          t={{
            emailLabel: t.emailLabel,
            submit: t.submit,
            sending: t.sending,
            sentTitle: t.sentTitle,
            sent: t.sent,
            sentHint: t.sentHint,
            again: t.again,
            errorEmail: t.errorEmail,
            errorTooMany: t.errorTooMany,
            errorGeneric: t.errorGeneric,
          }}
        />
      </div>
    </main>
  );
}
