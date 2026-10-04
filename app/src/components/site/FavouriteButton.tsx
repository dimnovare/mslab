"use client";

import { useState, useSyncExternalStore } from "react";
import { ACCOUNT_EVENT, hasAccountHint, subscribeAccountHint } from "@/components/account/useAccount";
import { ACCOUNT_FAVOURITES_KEY, FAVOURITES_EVENT, FAVOURITES_KEY, parseFavourites, setAccountFavourite, toggleFavourite } from "@/lib/favourites";
import { Icon } from "./Icon";
import styles from "./CourseActions.module.css";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // another tab changed a list
  window.addEventListener(FAVOURITES_EVENT, onChange);
  const unsubscribeHint = subscribeAccountHint(onChange); // signed in or out meanwhile: the other list counts
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(FAVOURITES_EVENT, onChange);
    unsubscribeHint();
  };
}

const stored = (key: string): string => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return ""; // storage blocked (private mode, settings)
  }
};

/** The list the button shows: the account's (this browser's copy) while the hint cookie says signed in, else this browser's own. */
const read = (): string => (hasAccountHint() ? `account:${stored(ACCOUNT_FAVOURITES_KEY)}` : `browser:${stored(FAVOURITES_KEY)}`);

const listOf = (snapshot: string): string[] => parseFavourites(snapshot.slice(snapshot.indexOf(":") + 1));

/**
 * ♡ "Lisa lemmikutesse" (Maria C33, C44 / P6): a toggle button. Pressed (aria-pressed), it says "Lemmikutes" with a filled
 * heart and offers "Eemalda lemmikutest" as its hint. The server renders it unpressed; the stored state shows as soon as the
 * page is interactive, and every button for the same course (this tab or another) follows a change.
 * - Not signed in: the hearts are kept in this browser (localStorage "mslab-fav", an array of course slugs).
 * - Signed in (the `mslab_in` hint cookie): the account's hearts (lib/favourites.ts). The page is cached and asks the server
 *   nothing when it loads: the state is this browser's copy of the account's list (localStorage "mslab-account-fav"), kept by
 *   every account page that loaded it. A press shows the change at once and sends it (POST /api/konto/lemmikud, one at a time);
 *   a failure puts back what the server has and says so in one short line ("Ei õnnestunud. Proovi uuesti.", a live region). If
 *   the session has ended meanwhile (401), the press goes to this browser's own list, quietly, and the header learns that it is
 *   signed out.
 */
export function FavouriteButton({ slug, t }: { slug: string; t: { add: string; added: string; remove: string; failed: string } }) {
  const snapshot = useSyncExternalStore(subscribe, read, () => "");
  const pressed = listOf(snapshot).includes(slug);
  const [failed, setFailed] = useState(false);

  const toggle = async () => {
    setFailed(false);
    if (hasAccountHint()) {
      const result = await setAccountFavourite(slug, !pressed);
      if (result === "browser") window.dispatchEvent(new Event(ACCOUNT_EVENT));
      if (result === "failed") setFailed(true);
      return;
    }
    try {
      localStorage.setItem(FAVOURITES_KEY, JSON.stringify(toggleFavourite(parseFavourites(stored(FAVOURITES_KEY)), slug)));
      window.dispatchEvent(new Event(FAVOURITES_EVENT));
    } catch {
      // Storage unavailable: the button simply stays as it is.
    }
  };

  return (
    <>
      <button type="button" className={styles.action} aria-pressed={pressed} title={pressed ? t.remove : t.add} onClick={() => void toggle()} data-favourite="">
        <Icon name="heart" size={18} filled={pressed} className={styles.heart} />
        {pressed ? t.added : t.add}
      </button>
      <span className={styles.failed} role="status" data-favourite-failed="">
        {failed ? t.failed : ""}
      </span>
    </>
  );
}
