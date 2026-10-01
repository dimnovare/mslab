"use client";

import { useSyncExternalStore } from "react";
import { FAVOURITES_EVENT, FAVOURITES_KEY, parseFavourites, toggleFavourite } from "@/lib/favourites";
import { Icon } from "./Icon";
import styles from "./CourseActions.module.css";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(FAVOURITES_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(FAVOURITES_EVENT, onChange);
  };
}

const read = (): string => {
  try {
    return localStorage.getItem(FAVOURITES_KEY) ?? "";
  } catch {
    return ""; // storage blocked (private mode, settings)
  }
};

/**
 * ♡ "Lisa lemmikutesse" (Maria C33, C44 / P6): a toggle button kept in this browser (localStorage "mslab-fav",
 * an array of course slugs). Phase 2 shows the same list in the student dashboard. The server renders it unpressed.
 */
export function FavouriteButton({ slug, t }: { slug: string; t: { add: string; remove: string } }) {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const pressed = parseFavourites(raw).includes(slug);

  const toggle = () => {
    try {
      localStorage.setItem(FAVOURITES_KEY, JSON.stringify(toggleFavourite(parseFavourites(read()), slug)));
      window.dispatchEvent(new Event(FAVOURITES_EVENT));
    } catch {
      // Storage unavailable: the button simply stays as it is.
    }
  };

  return (
    <button type="button" className={styles.action} aria-pressed={pressed} title={pressed ? t.remove : t.add} onClick={toggle}>
      <Icon name="heart" size={18} filled={pressed} className={styles.heart} />
      {t.add}
    </button>
  );
}
