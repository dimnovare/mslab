"use client";

import { startTransition, useActionState, useEffect, useState, type FormEvent, type RefObject } from "react";
import { adminEt } from "@/i18n/dict/admin";
import { stableJson } from "@/lib/version";
import type { EditResult, FieldError } from "@/server/edit-check";

/** An editor page's parts as the server loaded them: the drafts and their versions (server/admin-site.ts). */
export type Loaded<V> = { values: V; versions: Record<string, string> };

type Action = (prev: EditResult | null, formData: FormData) => Promise<EditResult>;
export type SaveStatus = { text: string; tone: "error" | "success" | "hint"; stale: boolean };

/**
 * The draft of a site editor page (home page, practice, trainer, campaign, settings, a post), saved with one
 * "Salvesta". Only the parts that differ from what was loaded are sent, each with the version it was loaded at; the
 * server refuses a part that was saved elsewhere meanwhile (stale) and returns the saved parts as now stored, which
 * become the new starting point. `always`: send every part even when unchanged (a new post: the save creates it).
 * While there are unsaved changes, leaving the page asks first (beforeunload); a refused save puts the focus on the
 * first marked field of `form`.
 */
export function useSiteDraft<V extends Record<string, unknown>>(initial: Loaded<V>, action: Action, form: RefObject<HTMLFormElement | null>, opts: { always?: boolean } = {}) {
  const [draft, setDraft] = useState<V>(initial.values);
  const [base, setBase] = useState<Loaded<V>>(initial);
  const [state, dispatch, pending] = useActionState<EditResult | null, FormData>(action, null);
  const [seen, setSeen] = useState<EditResult | null>(null);
  const [lastInitial, setLastInitial] = useState(initial);
  const [nothing, setNothing] = useState(false);

  // A save went through: the parts as stored now (normalised: trimmed, blank rows dropped) are the draft and the base.
  if (state !== seen) {
    setSeen(state);
    const saved = state?.ok ? state.saved : undefined;
    if (saved) {
      setBase((b) => ({ values: { ...b.values, ...(saved.values as Partial<V>) }, versions: { ...b.versions, ...saved.versions } }));
      setDraft((d) => ({ ...d, ...(saved.values as Partial<V>) }));
    }
  }
  // The page was rendered again with other stored versions (after a save elsewhere and a reload): those parts follow.
  if (initial !== lastInitial) {
    setLastInitial(initial);
    const changed = Object.keys(initial.versions).filter((k) => initial.versions[k] !== base.versions[k]);
    if (changed.length) {
      const pick = (v: V) => Object.fromEntries(changed.map((k) => [k, v[k]])) as Partial<V>;
      setBase((b) => ({ values: { ...b.values, ...pick(initial.values) }, versions: { ...b.versions, ...Object.fromEntries(changed.map((k) => [k, initial.versions[k]])) } }));
      setDraft((d) => ({ ...d, ...pick(initial.values) }));
    }
  }

  const keys = Object.keys(draft) as (keyof V & string)[];
  const dirtyParts = keys.filter((k) => stableJson(draft[k]) !== stableJson(base.values[k]));
  const dirty = dirtyParts.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!state || state.ok || state.error !== "invalid") return;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid]')?.focus();
  }, [state, form]);

  const set = <K extends keyof V>(key: K, value: V[K]) => {
    setNothing(false);
    setDraft((d) => ({ ...d, [key]: value }));
  };
  /** A functional update of one part (an upload can finish after other edits: it must add to the part as it is then). */
  const update = <K extends keyof V>(key: K, fn: (value: V[K]) => V[K]) => {
    setNothing(false);
    setDraft((d) => ({ ...d, [key]: fn(d[key]) }));
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const send = opts.always ? keys : dirtyParts;
    if (send.length === 0) return setNothing(true);
    setNothing(false);
    const parts = Object.fromEntries(send.map((k) => [k, { version: base.versions[k] ?? "", value: draft[k] }]));
    const fd = new FormData();
    fd.set("data", JSON.stringify({ parts }));
    startTransition(() => dispatch(fd));
  };

  const fields = state && !state.ok ? (state.fields ?? {}) : {};
  /** The error text of a field ("slides.0.title", "MAXI.price"), if the last save refused it. */
  const err = (name: string): string | undefined => {
    const code = fields[name] as FieldError | undefined;
    return code ? adminEt.courseEditor.errors[code] : undefined;
  };
  /** Does any refused field start with this prefix ("slides.2.")? */
  const hasErrors = (prefix: string) => Object.keys(fields).some((k) => k.startsWith(prefix));

  const t = adminEt.editor;
  const status: SaveStatus = pending
    ? { text: t.saving, tone: "hint", stale: false }
    : state && !state.ok
      ? { text: state.error === "invalid" ? t.invalid : state.error === "stale" ? t.stale : state.error === "notFound" ? adminEt.post.notFound : adminEt.common.saveError, tone: "error", stale: state.error === "stale" }
      : dirty
        ? { text: t.dirty, tone: "hint", stale: false }
        : nothing
          ? { text: t.clean, tone: "hint", stale: false }
          : state?.ok
            ? { text: t.saved, tone: "success", stale: false }
            : { text: "", tone: "hint", stale: false };

  return { draft, base, set, update, submit, pending, state, dirty, err, hasErrors, status };
}
