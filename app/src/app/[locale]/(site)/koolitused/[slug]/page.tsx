import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { ContactRegister, type SessionOption } from "@/components/site/ContactRegister";
import { courseCardData } from "@/components/site/course-card-data";
import { CourseSummary, type SummaryItem } from "@/components/site/CourseSummary";
import { ELearningBuy } from "@/components/site/ELearningBuy";
import { FavouriteButton } from "@/components/site/FavouriteButton";
import { Gallery } from "@/components/site/Gallery";
import { Icon } from "@/components/site/Icon";
import { IncludesList } from "@/components/site/IncludesList";
import { ModuleList } from "@/components/site/ModuleList";
import { Recommendations } from "@/components/site/Recommendations";
import { trainerSettings } from "@/components/site/settings";
import { ShareButton } from "@/components/site/ShareButton";
import { TrainerCard, TrainerLink, type TrainerInfo } from "@/components/site/TrainerLink";
import ui from "@/components/site/ui.module.css";
import { getDb } from "@/db/client";
import { getCourseBySlug, getPage, getSettings, listPublishedCourses, listUpcomingSessions } from "@/db/queries/public";
import { bookableCities, initialSession, paragraphs } from "@/domain/catalogue";
import { priceOptions } from "@/domain/course";
import { firstParagraph, nextSessionByCourse } from "@/domain/home";
import { formatEUR } from "@/domain/money";
import { recommend } from "@/domain/recommend";
import { seatState, seatsLeft } from "@/domain/sessions";
import { pick, pickList } from "@/i18n/field";
import { fill, formatDate, formatWeekday } from "@/i18n/format";
import { href } from "@/i18n/href";
import { getDict, isLocale } from "@/i18n/locales";
import { mediaUrl } from "@/lib/media";
import styles from "./course.module.css";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// One course query per request, shared by generateMetadata and the page. Past sessions are left out.
const loadCourse = cache(async (slug: string) => {
  await connection();
  return getCourseBySlug(getDb(), slug, { sessionsFrom: new Date() });
});

export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const course = await loadCourse(slug);
  if (!course) return {};
  const d = getDict(locale);
  return { title: `${pick(course.title, locale)} — ${d.common.siteName}`, description: pick(course.summary, locale) };
}

/**
 * Course page (Task 8, P1–P16) on prototype B's detail layout: gallery left, facts and the type's own purchase or
 * registration right. A course is either e-learning (buy now) or contact (register for a date or ask for an individual
 * course); the page never offers another format (K1, K2). Description, outcomes, contents, trainer and recommendations
 * follow below, recommendations last (P5).
 */
export default async function CoursePage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const course = await loadCourse(slug);
  if (!course) notFound();
  const d = getDict(locale);
  const to = (path: string) => href(locale, path);
  const db = getDb();
  const [all, upcoming, settings, bio, query] = await Promise.all([
    listPublishedCourses(db),
    listUpcomingSessions(db, new Date()),
    getSettings(db),
    getPage(db, "trainer_bio"),
    searchParams,
  ]);

  const c = d.course;
  const online = course.type === "e_learning";
  const title = pick(course.title, locale);
  const images = course.images.map((img) => ({ src: mediaUrl(img.key), alt: pick(img.alt, locale) || title }));

  const t = trainerSettings(settings);
  const trainerName = t.name || pick(bio?.title, locale);
  const trainer: TrainerInfo = {
    name: trainerName,
    role: pick(t.role, locale),
    text: firstParagraph(pick(bio?.body, locale)),
    portrait: mediaUrl(t.portraitKey),
    avatar: mediaUrl(t.contactPhotoKey),
    href: to("/koolitaja"),
  };

  // Right-column facts (P3): only the ones the course has.
  const fact = (label: string, value: React.ReactNode | null | undefined): SummaryItem[] => (value === null || value === undefined || value === "" ? [] : [{ label, value }]);
  const trainerFact: SummaryItem[] = trainerName ? [{ label: c.trainerLabel, value: <TrainerLink trainer={trainer} />, wide: true }] : [];
  const modules = pickList(course.modules, locale);
  const cities = bookableCities(course.sessions);
  const summaryItems: SummaryItem[] = online
    ? [
        ...fact(c.modulesLabel, modules.length || null),
        ...fact(c.videosLabel, course.videoCount),
        ...fact(c.accessLabel, course.accessMonths ? `${course.accessMonths} ${c.monthsUnit}` : null),
        ...fact(c.languageLabel, course.language),
        ...trainerFact,
      ]
    : [
        ...fact(c.durationLabel, pick(course.durationLabel, locale)),
        ...fact(c.languageLabel, course.language),
        ...fact(c.citiesLabel, cities.join(", ")),
        ...trainerFact,
      ];
  const discountText = pick(course.nextDiscount, locale);
  const discount = discountText ? { label: c.discountLabel, value: discountText } : undefined;

  // Contact: participation kinds with a price (P12, P13) and the upcoming sessions with their seat state.
  const stateWord = { open: d.calendar.stateOpen, few: d.calendar.stateFew, full: d.calendar.stateFull, cancelled: d.calendar.stateCancelled };
  const sessions: SessionOption[] = course.sessions.map((s) => {
    const state = seatState(s, s.confirmed);
    const left = seatsLeft(s.capacity, s.confirmed);
    return {
      id: s.id,
      date: formatDate(s.startsAt, locale),
      weekday: formatWeekday(s.startsAt, locale),
      city: s.city,
      venue: s.venue,
      language: s.language,
      state,
      stateLabel: state === "open" || state === "few" ? `${stateWord[state]} · ${left}` : stateWord[state],
      disabled: state === "full" || state === "cancelled",
    };
  });
  const kinds = priceOptions(course).flatMap((o) => (o.kind === "full" ? [] : [{ kind: o.kind, price: formatEUR(o.cents, locale) }]));

  // Recommendations (P5): Maria's picks first, then the closest courses — same type and level preferred, the other
  // type fills in (hybrid in Maria's sense: an e-learning course plus a different contact course).
  const nextByCourse = nextSessionByCourse(upcoming);
  const recommended = recommend(course, all, 3).flatMap((r) => {
    const full = all.find((x) => x.id === r.id);
    return full ? [courseCardData(full, nextByCourse.get(full.id), locale, d, to)] : [];
  });

  const body = paragraphs(pick(course.body, locale));
  const outcomes = pickList(course.outcomes, locale);
  const includes = online
    ? [...(course.videoCount ? [fill(c.includesVideos, { n: course.videoCount })] : []), ...c.includesElearning]
    : pickList(course.includes, locale);

  return (
    <>
      <div className={ui.wrap}>
        <nav className={styles.crumb} aria-label={c.breadcrumb}>
          <ol>
            <li>
              <Link href={to("/")}>{d.common.home}</Link>
            </li>
            <li>
              <Link href={to("/koolitused")}>{d.nav.courses}</Link>
            </li>
            <li aria-current="page">{title}</li>
          </ol>
        </nav>

        <div className={styles.detail}>
          <div className={styles.media}>
            <Gallery
              images={images}
              t={{
                label: c.galleryLabel,
                thumbs: c.thumbsLabel,
                prevThumbs: c.prevThumbs,
                nextThumbs: c.nextThumbs,
                open: d.common.openImage,
                dialog: d.common.imageViewer,
                close: d.common.close,
                previous: d.common.previous,
                next: d.common.next,
              }}
            />
          </div>

          <div className={styles.info}>
            <div className={styles.tags} data-course-tags="">
              {course.badge?.label && (
                <span className={styles.badge} style={{ background: course.badge.bg, color: course.badge.fg }}>
                  {course.badge.label}
                </span>
              )}
              <span className={styles.tag}>{online ? d.formats.elearning.name : d.formats.contact.name}</span>
              <span className={styles.tag}>{course.level === "basic" ? c.levelBasic : c.levelAdvanced}</span>
              <span className={`${styles.tag} ${styles.tagOutline}`}>{course.language}</span>
            </div>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.summary}>{pick(course.summary, locale)}</p>
            <div className={styles.actions}>
              <FavouriteButton slug={course.slug} t={{ add: c.favourite, added: c.favourited, remove: c.unfavourite }} />
              <ShareButton title={title} t={{ label: c.share, copied: c.shareCopied }} />
            </div>

            <CourseSummary items={summaryItems} discount={discount} />

            {online ? (
              course.price != null && (
                <ELearningBuy
                  price={formatEUR(course.price, locale)}
                  href={to(`/ostukorv?kursus=${encodeURIComponent(course.slug)}`)}
                  t={{ priceLabel: c.priceLabel, paymentLabel: d.forms.paymentLabel, payNow: c.payNow, instalmentSoon: c.instalmentSoon, instalmentNote: c.instalmentNote, buyNow: c.buyNow }}
                />
              )
            ) : (
              <ContactRegister
                course={course.slug}
                locale={locale}
                kinds={kinds}
                sessions={sessions}
                initialSession={initialSession(sessions, query.sessioon)}
                t={{
                  participationLabel: c.participationLabel,
                  group: c.group,
                  individual: c.individual,
                  pickSession: c.pickSession,
                  noSessions: c.noSessions,
                  switchIndividual: c.switchIndividual,
                  individualNote: c.individualNote,
                  sessionRequired: c.sessionRequired,
                  sessionFull: c.sessionFull,
                  sessionUnavailable: c.sessionUnavailable,
                  name: d.forms.name,
                  email: d.forms.email,
                  phone: d.forms.phone,
                  paymentLabel: d.forms.paymentLabel,
                  payFull: d.forms.payFull,
                  payHalf: d.forms.payHalf,
                  modelHelp: d.forms.modelHelp,
                  createAccount: d.forms.createAccount,
                  terms: d.forms.terms,
                  termsLink: { label: d.footer.terms, href: to("/tingimused") },
                  preferredPeriod: d.forms.preferredPeriod,
                  preferredPeriodPlaceholder: d.forms.preferredPeriodPlaceholder,
                  message: d.forms.message,
                  optional: d.forms.optional,
                  register: d.forms.register,
                  requestSubmit: d.forms.requestSubmit,
                  sending: d.forms.sending,
                  confirmAfterPrepayment: c.confirmAfterPrepayment,
                  registerSuccess: c.registerSuccess,
                  individualSent: d.forms.individualSent,
                  errorRequired: d.forms.errorRequired,
                  errorEmail: d.forms.errorEmail,
                  errorTooMany: d.forms.errorTooMany,
                  errorGeneric: d.forms.errorGeneric,
                }}
              />
            )}
          </div>
        </div>
      </div>

      <section className={`${ui.wrap} ${styles.bottom}`} aria-label={c.descriptionTitle}>
        <div className={styles.column}>
          {body.length > 0 && (
            <div className={styles.block}>
              <h2 className={styles.h2}>{c.descriptionTitle}</h2>
              <div className={styles.prose}>
                {body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </div>
          )}
          {outcomes.length > 0 && (
            <div className={styles.block}>
              <h2 className={styles.h2}>{c.outcomesTitle}</h2>
              <ul className={styles.checkList}>
                {outcomes.map((x) => (
                  <li key={x}>
                    <Icon name="check" size={16} />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className={styles.column}>
          {includes.length > 0 && (
            <div className={styles.block}>
              <h2 className={styles.h2}>{c.includesTitle}</h2>
              <IncludesList items={includes} />
              {/* P11: own models welcome, the centre helps when needed (the form has the matching checkbox). */}
              {!online && <p className={styles.notice}>{c.modelsNote}</p>}
            </div>
          )}
          {modules.length > 0 && (
            <div className={styles.block}>
              <h2 className={styles.h2}>{online ? c.modulesLabel : c.programmeTitle}</h2>
              <ModuleList items={modules} locked={online} lockedLabel={c.locked} />
            </div>
          )}
        </div>
      </section>

      {trainer.name && (
        <section className={`${ui.wrap} ${styles.trainer}`} aria-label={d.trainer.eyebrow}>
          <TrainerCard trainer={trainer} t={{ eyebrow: d.trainer.eyebrow, readMore: d.trainer.readMore, portraitAlt: fill(d.trainer.portraitAlt, { name: trainer.name }) }} />
        </section>
      )}

      <Recommendations title={c.recommendations} cards={recommended} />
    </>
  );
}
