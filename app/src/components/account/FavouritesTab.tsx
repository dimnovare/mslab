"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import catalogue from "@/components/site/CatalogueFilters.module.css";
import actions from "@/components/site/CourseActions.module.css";
import { CourseCard } from "@/components/site/CourseCard";
import { Icon } from "@/components/site/Icon";
import ui from "@/components/site/ui.module.css";
import { fill } from "@/i18n/format";
import { href } from "@/i18n/href";
import type { Locale } from "@/i18n/locales";
import { answerFavourites, FAVOURITES_MERGED_EVENT, readAccountFavourites, rememberAccountFavourites } from "@/lib/favourites";
import type { FavouriteCard, FavouriteCards } from "@/server/client-data";
import { AccountLoader, type Reload } from "./AccountLoader";
import type { FavouritesTexts } from "./texts";
import page from "./CoursesTab.module.css";
import bones from "./Skeleton.module.css";
import styles from "./FavouritesTab.module.css";

/** The catalogue grid's image sizes (CatalogueFilters). */
const SIZES = "(max-width: 640px) 100vw, (max-width: 1180px) 50vw, 33vw";

/**
 * "Lemmikud" (/konto/lemmikud): the client's favourite courses as the public catalogue shows them (CourseCard, the catalogue's
 * grid), each with ♡ "Eemalda lemmikutest" under it; the empty state says the one thing to do, with "Vaata koolitusi". The page
 * itself is a static shell: AccountLoader loads GET /api/konto/lemmikud in the page's language in the browser.
 */
export function FavouritesTab({ locale, t }: { locale: Locale; t: FavouritesTexts }) {
  return (
    <AccountLoader<FavouriteCards>
      path={`/api/konto/lemmikud?l=${locale}`}
      locale={locale}
      t={{ ...t.loader, loading: t.loading }}
      skeleton={<FavouritesSkeleton />}
      render={(data, reload) => <FavouritesView data={data} locale={locale} t={t} reload={reload} />}
    />
  );
}

/** While the list loads: the heading's stand-in and two cards' photos and titles. */
function FavouritesSkeleton() {
  return (
    <div className={`${ui.wrap} ${page.page}`}>
      <span className={`${bones.bone} ${bones.title}`} aria-hidden="true" />
      <div className={`${catalogue.grid} ${styles.list}`} aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className={styles.item}>
            <span className={`${bones.bone} ${bones.photo}`} />
            <span className={`${bones.bone} ${bones.cardTitle}`} />
            <span className={`${bones.bone} ${bones.line}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The list. ♡ sends POST /api/konto/lemmikud `{ slug, on: false }`; the card leaves the list in place (no reload), the focus moves to
 * the next card's ♡ (the one before when it was the last, the heading when none is left), and a screen reader hears what was taken
 * off. A failure keeps the card and says so under it; a session that has ended (401) loads the page again, which then says so.
 * The list follows the account: when this tab's copy holds a favourite the list does not show — the browser's own favourites, merged in
 * just after this page loaded (lib/favourites.ts) — it is loaded again, quietly. Checked when an answer is shown and after a merge (not on
 * every change of the copy: an answer writes the copy just before the page shows it, and would ask again for nothing).
 */
function FavouritesView({ data, locale, t, reload }: { data: FavouriteCards; locale: Locale; t: FavouritesTexts; reload: Reload }) {
  const titleId = useId();
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  /** Where the focus goes once a card has left: the place it had in the list. */
  const focusAt = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const cards = data.cards.filter((c) => !gone.has(c.slug));

  useEffect(() => {
    const listed = new Set(data.cards.map((c) => c.slug));
    const check = () => {
      if (readAccountFavourites()?.some((slug) => !listed.has(slug))) void reload({ quiet: true });
    };
    check();
    window.addEventListener(FAVOURITES_MERGED_EVENT, check);
    return () => window.removeEventListener(FAVOURITES_MERGED_EVENT, check);
  }, [data, reload]);

  useEffect(() => {
    const at = focusAt.current;
    if (at === null) return;
    focusAt.current = null;
    const buttons = list.current?.querySelectorAll<HTMLElement>("[data-favourite-remove]") ?? [];
    (buttons[Math.min(at, buttons.length - 1)] ?? heading.current)?.focus();
  }, [gone]);

  const remove = async (item: FavouriteCard, index: number) => {
    if (busy) return;
    setBusy(item.slug);
    setFailed(null);
    setAnnounce("");
    let status = 0; // 0: no answer
    let left: string[] | null = null;
    try {
      const res = await fetch("/api/konto/lemmikud", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ slug: item.slug, on: false }),
      });
      status = res.status;
      const body: unknown = await res.json().catch(() => null);
      left = res.ok && (body as { ok?: unknown } | null)?.ok === true ? answerFavourites(body) : null;
    } catch {
      // no answer: said under the card
    }
    setBusy(null);
    if (status === 401) return void reload({ quiet: true }); // signed out meanwhile: the page shows what is true now
    if (!left) return setFailed(item.slug);
    focusAt.current = index;
    setGone((before) => new Set(before).add(item.slug));
    setAnnounce(fill(t.removed, { title: item.card.title }));
    rememberAccountFavourites(left); // the course pages' ♡ in this tab follows
  };

  return (
    <div className={`${ui.wrap} ${page.page}`} data-account-favourites="">
      <h1 ref={heading} id={titleId} className={page.title} tabIndex={-1}>
        {t.title}
      </h1>
      <p className={ui.srOnly} role="status" data-favourites-status="">
        {announce}
      </p>

      {cards.length === 0 ? (
        <div className={`${catalogue.empty} ${page.empty}`} data-favourites-empty="">
          <p className={catalogue.emptyTitle}>{t.empty}</p>
          <Link className={ui.btn} href={href(locale, "/koolitused")}>
            {t.browse}
            <Icon name="arrow" />
          </Link>
        </div>
      ) : (
        <ul ref={list} className={`${catalogue.grid} ${styles.list}`} aria-labelledby={titleId}>
          {cards.map((item, index) => (
            <li key={item.slug} className={styles.item} data-favourite-card={item.slug}>
              <CourseCard c={item.card} square sizes={SIZES} />
              <button
                type="button"
                className={`${actions.action} ${styles.remove}`}
                aria-label={fill(t.removeCourse, { title: item.card.title })}
                aria-disabled={busy === item.slug || undefined}
                onClick={() => void remove(item, index)}
                data-favourite-remove={item.slug}
              >
                <Icon name="heart" size={18} filled className={`${actions.heart} ${styles.heart}`} />
                {t.remove}
              </button>
              <p className={styles.failed} role="status">
                {failed === item.slug ? t.removeFailed : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
