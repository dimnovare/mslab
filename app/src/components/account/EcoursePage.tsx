"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/site/Icon";
import { Notice } from "@/components/site/Notice";
import ui from "@/components/site/ui.module.css";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import type { EcourseView as EcourseData } from "@/server/client-data";
import { AccountLoader, type Reload } from "./AccountLoader";
import { GreetingSkeleton } from "./CardSkeleton";
import { EcourseView } from "./EcourseView";
import { TermsGate } from "./TermsGate";
import type { EcourseTexts } from "./texts";
import styles from "./EcoursePage.module.css";

/**
 * The personal part of /konto/kursus/<slug> (the page itself is a static shell, the same for every visitor): loads
 * GET /api/konto/kursus/<slug> in the browser (AccountLoader: skeleton, signed out → login page, another device, error + retry), then
 * - 404, no active access: "Sul ei ole sellele koolitusele ligipääsu." and one button to the public course page, not the error;
 * - terms of the current version not accepted: the notice (TermsGate), then the course;
 * - otherwise the course (EcourseView).
 */
export function EcoursePage({ slug, locale, t }: { slug: string; locale: Locale; t: EcourseTexts }) {
  return (
    <AccountLoader<EcourseData>
      path={`/api/konto/kursus/${encodeURIComponent(slug)}`}
      locale={locale}
      t={t.loader}
      skeleton={
        <div className={`${ui.wrap} ${styles.wait}`}>
          <GreetingSkeleton />
        </div>
      }
      notFound={
        <div data-account-state="noAccess">
          <Notice title={t.noAccess}>
            <Link className={ui.btn} href={href(locale, `/koolitused/${slug}`)}>
              {t.viewCourse}
              <Icon name="arrow" />
            </Link>
          </Notice>
        </div>
      }
      render={(data, reload) => <EcourseBody data={data} locale={locale} t={t} reload={reload} />}
    />
  );
}

/**
 * What the loaded e-course shows. The version the student accepted here is kept, so the course opens at once without asking the
 * server again (everything the view needs is already loaded); a newer version (a quiet reload after the admin saved new terms)
 * puts the notice up again. `reshown`: the notice came back after a refresh, so it takes the focus.
 */
function EcourseBody({ data, locale, t, reload }: { data: EcourseData; locale: Locale; t: EcourseTexts; reload: Reload }) {
  const [acceptedVersion, setAcceptedVersion] = useState<string | null>(null);
  const [reshown, setReshown] = useState(false);
  const { version, text } = data.terms;

  if (!data.terms.accepted && acceptedVersion !== version)
    return (
      <TermsGate
        key={version}
        slug={data.course.slug}
        version={version}
        text={text}
        locale={locale}
        t={t}
        focusTitle={reshown}
        onAccepted={() => setAcceptedVersion(version)}
        onRefresh={() => {
          setReshown(true);
          return reload({ quiet: true });
        }}
      />
    );
  return <EcourseView data={data} locale={locale} t={t} focusHeading={acceptedVersion === version} />;
}
