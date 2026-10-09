"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import ui from "@/components/site/ui.module.css";
import { endedAt, seekStep, videoAspect, type VideoShape } from "@/domain/lessons";
import { fill } from "@/i18n/format";
import { PLAYER_EVENTS, playerCommand, readPlayerMessage, secondsOf } from "./player-js";
import type { LessonTexts } from "./texts";
import styles from "./LessonPlayer.module.css";

/** How often the furthest point reached is reported (spec 5: about every 15 s), besides at pause and end. */
export const PROGRESS_EVERY_MS = 15_000;
/** The watermark moves to another corner this often (spec 5: about every 60 s). */
export const WATERMARK_MOVE_MS = 60_000;
/** No "ready" from the player in this time: "Video ei lae. Proovi hiljem uuesti." (spec 7). */
export const READY_TIMEOUT_MS = 20_000;
/** The line under the player after a jump forward was taken back stays this long (spec 3). */
export const SEEK_NOTE_MS = 6000;

type Props = {
  slug: string;
  lessonId: number;
  title: string;
  /** `shape`: the picture size of the video, from the lesson answer; null when unknown (then 16:9). */
  video: { embedUrl: string; durationSec: number; resumeAt: number; shape: VideoShape | null };
  watermark: string;
  /** Already done: nothing more is reported. */
  done: boolean;
  t: LessonTexts;
  /** The server's answer to a report: done (the page shows "Õppetund tehtud ✓") and the next lesson. */
  onProgress(answer: { done: boolean; next: number | null }): void;
  /**
   * A report was answered 401: the session has ended (signed out, or another device signed in). Called once, as the reports stop;
   * the page then asks for its data again and shows what is true now ("Sinu konto avati teises seadmes", or the login page).
   */
  onSessionEnd?(): void;
};

/** What became of one report: taken, worth trying again later (408, 429, 5xx, no answer), or refused for good (the rest). */
type Sent = "taken" | "later" | "refused";

/**
 * One lesson's video (spec 5): Bunny's iframe (adaptive quality, speed, phone friendly), signed for 4 hours, started at the saved
 * second. Over it the student's e-mail as a faint watermark that moves between the corners (it does not take clicks). The iframe may
 * not go fullscreen or picture-in-picture on its own (either would drop the watermark): our button enlarges the wrapper, iframe and
 * watermark together (an iPhone without the Fullscreen API gets the wrapper over the whole window; its native video fullscreen still
 * shows no watermark — accepted). The frame has the video's own shape (`video.shape`, 16:9 when unknown), as a CSS number `--aspect`
 * on the wrapper: a wide video fills the column, an upright or square one (`data-upright`) is centred with its height capped (CSS).
 * Enlarged, the frame is the largest box of that shape that fits the screen, in its middle, the size of the picture, so the
 * watermark's corners are the picture's (not black bars around it). Progress: the furthest second reached, reported every 15 s
 * when it moved, and at pause and end. A timeupdate more than 3 s past the furthest point is a jump forward: the player is sent
 * back there (Player.js setCurrentTime) and a line under it says how far one may skip, for 6 s; rewinding and speed stay free, and a
 * lesson already done is not locked (domain/lessons.ts seekStep).
 *
 * The reports never trouble the student. A report the server cannot take now (408, 429, 5xx) or that gets no answer keeps the
 * furthest second, which goes with the next 15 s report (no retry in between, not even at pause or end); one refused for good (403
 * locked, 404, 409 no playable video, 401 signed out) ends the reports for this lesson. A 401 also tells the page, once
 * (`onSessionEnd`), so that it does not go on as if the student were still signed in. Leaving (the tab hidden, the page closed, or
 * the player gone by a link inside the site) sends the last point with `fetch(…, { keepalive: true })`: same-origin, with the session
 * cookie and the page's Origin like any other report (account-api's isCrossSite check passes it), where sendBeacon could set no
 * headers. Once the player is gone, nothing it started reaches the page any more.
 *
 * Another lesson or another signed URL is another player (the key below): its state starts afresh, whether or not the page keys it.
 */
export function LessonPlayer(props: Props) {
  return <Player key={`${props.slug}/${props.lessonId}/${props.video.embedUrl}`} {...props} />;
}

function Player({ slug, lessonId, title, video, watermark, done, t, onProgress, onSessionEnd }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const furthest = useRef(video.resumeAt);
  const reported = useRef(video.resumeAt);
  /** Nothing more to report: the lesson is done, or the server refused this lesson for good. */
  const finished = useRef(done);
  const answered = useRef(onProgress);
  const sessionEnded = useRef(onSessionEnd);
  const [listening, setListening] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [corner, setCorner] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [seekNote, setSeekNote] = useState(false);
  // Only the player's own frame may talk to the page: its window, from https://player.mediadelivery.net (the origin of the URL the
  // server signed; the e2e run's fake Bunny gives its own address there, a setting server/bunny.ts ignores on Vercel).
  const origin = new URL(video.embedUrl).origin;
  const progressUrl = `/api/konto/kursus/${encodeURIComponent(slug)}/${lessonId}/progress`;

  useEffect(() => {
    answered.current = onProgress;
    sessionEnded.current = onSessionEnd;
    if (done) finished.current = true;
  });

  // The Player.js listener and the reports. Attached before the iframe exists: the player posts "ready" once, when it loads.
  useEffect(() => {
    let sending = false;
    let again = false;
    /** After a report the server could not take: the next try waits for the 15 s report. */
    let holding = false;
    /** The second of a leaving report still on its way (the tab hidden, then the page closed, must not send it twice). */
    let leaving = 0;
    /** The player is gone: no new report (but the leaving one), and no answer reaches the page. */
    let disposed = false;
    /** The page has been told that the session ended (a 401): once. */
    let sessionTold = false;

    const send = async (watchedSec: number, keepalive: boolean): Promise<Sent> => {
      try {
        const res = await fetch(progressUrl, {
          method: "POST",
          credentials: "same-origin",
          ...(keepalive ? { keepalive: true } : {}),
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ watchedSec }),
        });
        if (res.ok) {
          const body = (await res.json().catch(() => null)) as { done?: unknown; next?: unknown } | null;
          reported.current = Math.max(reported.current, watchedSec);
          const answer = { done: body?.done === true, next: typeof body?.next === "number" ? body.next : null };
          if (answer.done) finished.current = true;
          if (!disposed) answered.current(answer);
          return "taken";
        }
        if (res.status === 408 || res.status === 429 || res.status >= 500) return "later";
        finished.current = true; // locked, not found, no playable video, signed out: asking again changes nothing
        // signed out or replaced: the page is told, once (a leaving report already on its way may be answered 401 too)
        if (res.status === 401 && !sessionTold && !disposed) {
          sessionTold = true;
          sessionEnded.current?.();
        }
        return "refused";
      } catch {
        return "later"; // no answer (offline, a dropped connection): the next 15 s report carries the point
      }
    };

    const report = async (onTime = false): Promise<void> => {
      if (onTime) holding = false;
      const watchedSec = Math.floor(furthest.current);
      if (disposed || finished.current || holding || watchedSec <= Math.max(reported.current, leaving)) return;
      if (sending) {
        again = true;
        return;
      }
      sending = true;
      const sent = await send(watchedSec, false);
      sending = false;
      if (sent === "later") holding = true;
      if (again) {
        again = false;
        void report();
      }
    };

    let noteTimer: number | undefined;
    /** "Edasi saab kerida kuni kohani, kuhu oled jõudnud." under the player, for 6 s (a second jump starts the 6 s again). */
    const showSeekNote = () => {
      setSeekNote(true);
      window.clearTimeout(noteTimer);
      noteTimer = window.setTimeout(() => setSeekNote(false), SEEK_NOTE_MS);
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || !frame.current || e.source !== frame.current.contentWindow) return;
      const message = readPlayerMessage(e.data);
      if (!message) return;
      if (message.event === "ready") {
        setReady(true);
        setFailed(false);
        for (const event of PLAYER_EVENTS) frame.current.contentWindow?.postMessage(playerCommand("addEventListener", event, `mslab-${event}`), origin);
      } else if (message.event === "timeupdate") {
        const seconds = secondsOf(message.value);
        if (seconds === null) return;
        // a lesson that is done (or refused for good) reports nothing more: skipping ahead is free
        if (finished.current) return;
        const step = seekStep(furthest.current, seconds, video.durationSec);
        furthest.current = step.furthest;
        if (step.back !== null) {
          frame.current.contentWindow?.postMessage(playerCommand("setCurrentTime", step.back), origin);
          showSeekNote();
        }
      } else if (message.event === "pause") {
        void report();
      } else if (message.event === "ended") {
        furthest.current = endedAt(furthest.current, video.durationSec);
        void report();
      }
    };

    // leaving: the last point, sent even as the page goes away (and while another report is still on its way: an unloading page
    // cancels that one)
    const leave = () => {
      const watchedSec = Math.floor(furthest.current);
      if (finished.current || watchedSec <= Math.max(reported.current, leaving)) return;
      leaving = watchedSec;
      void send(watchedSec, true).then(() => {
        if (leaving === watchedSec) leaving = 0; // answered (then `reported` has it) or failed (then the 15 s report tries again)
      });
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") leave();
    };

    const timer = setInterval(() => void report(true), PROGRESS_EVERY_MS);
    window.addEventListener("message", onMessage);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onHidden);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the iframe comes only now, with the listener in place: its one "ready" must not be missed
    setListening(true);
    return () => {
      leave(); // the player goes away inside the site (a link to the next lesson): no pagehide comes
      disposed = true;
      clearInterval(timer);
      window.clearTimeout(noteTimer);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [origin, progressUrl, video.durationSec]);

  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setFailed(true), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    const timer = setInterval(() => setCorner((c) => (c + 1) % 4), WATERMARK_MOVE_MS);
    return () => clearInterval(timer);
  }, []);

  // the browser's fullscreen: entered by our button, left by it or by the browser (Escape); the focus comes back to the button
  useEffect(() => {
    let was = false;
    const onChange = () => {
      const now = document.fullscreenElement === wrapper.current;
      if (was && !now) button.current?.focus();
      was = now;
      setFullscreen(now);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // The window-filling wrapper (no Fullscreen API): Escape closes it, the page behind does not scroll, the focus stays inside it
  // (the player's frame and the button) and comes back to the button when it closes.
  useEffect(() => {
    if (!expanded) return;
    const back = button.current; // the button stays while the wrapper is enlarged
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof Node && !wrapper.current?.contains(e.target)) back?.focus();
    };
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      html.style.overflow = overflow;
      if (back?.isConnected) back.focus();
    };
  }, [expanded]);

  const toggle = () => {
    const el = wrapper.current;
    if (!el) return;
    if (fullscreen) void document.exitFullscreen?.().catch(() => {});
    else if (expanded) setExpanded(false);
    else if (typeof el.requestFullscreen === "function") void el.requestFullscreen().catch(() => setExpanded(true));
    else setExpanded(true);
  };
  const big = fullscreen || expanded;
  const broken = failed && !ready;
  const aspect = videoAspect(video.shape);

  return (
    <div
      ref={wrapper}
      className={styles.player}
      style={{ "--aspect": String(aspect) } as CSSProperties}
      data-player=""
      data-upright={aspect <= 1 ? "" : undefined}
      data-expanded={expanded ? "" : undefined}
    >
      <div className={styles.stage}>
        <div className={styles.frame} data-player-frame="">
          {listening && (
            <iframe
              ref={frame}
              src={video.embedUrl}
              title={fill(t.video, { title })}
              allow="autoplay; encrypted-media"
              referrerPolicy="strict-origin-when-cross-origin"
              loading="eager"
            />
          )}
          <span className={styles.mark} data-watermark="" data-corner={corner} aria-hidden="true">
            {watermark}
          </span>
          {/* in the page from the start, empty: a screen reader announces the sentence when it comes */}
          <div role="status">
            {broken && (
              <p className={styles.failed} data-player-error="">
                {t.videoError}
              </p>
            )}
          </div>
        </div>
      </div>
      {/* in the page from the start, empty: the sentence is announced when a jump forward was taken back */}
      <p className={styles.seekNote} role="status" data-seek-note="">
        {seekNote ? t.seekLocked : ""}
      </p>
      {/* no "Täisekraan" next to a video that does not load; still the way out when the student is already in it */}
      {(!broken || big) && (
        <div className={styles.bar}>
          <button ref={button} type="button" className={ui.btnOutline} onClick={toggle} data-fullscreen="">
            {big ? t.exitFullscreen : t.fullscreen}
          </button>
        </div>
      )}
    </div>
  );
}
