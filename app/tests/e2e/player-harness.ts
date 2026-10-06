import { join } from "node:path";
import type { Page } from "@playwright/test";
import { build } from "esbuild";
import { accountCourseSlug, onLocalDb } from "./fixtures";
import type { HarnessProps } from "./player-harness-entry";

// The lesson player's e2e harness (lesson-player.spec.ts). The lesson page that holds LessonPlayer comes with Task 9; the player is
// tested on its own here, also in the cases that page cannot show on demand (Bunny not answering, a browser without the Fullscreen
// API). player-harness-entry.tsx is bundled with esbuild (a devDependency, pinned to the version tsx and vite use) and served by
// Playwright's router at HARNESS_PATH on the site's own origin (the dev server never sees that address), with the site's own
// stylesheets and fonts, read from the page the browser is on. Everything else is real: the lesson API's signed embed URL and
// e-mail, the fake Bunny's Player.js page in the iframe (fake-bunny.ts), the progress endpoint with the student's session.

/** Where the harness page is served: never asked of the server (Playwright answers it). */
export const HARNESS_PATH = "/__e2e/lesson-player";

let bundle: Promise<{ js: string; css: string }> | undefined;

/** The harness's script and its styles (LessonPlayer's and the site's CSS modules it uses), bundled once per worker. */
function harnessBundle(): Promise<{ js: string; css: string }> {
  bundle ??= build({
    entryPoints: [join(process.cwd(), "tests", "e2e", "player-harness-entry.tsx")],
    bundle: true,
    write: false,
    outdir: "harness",
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    tsconfig: join(process.cwd(), "tsconfig.json"),
    logLevel: "error", // not the "use client" warnings
  }).then(({ outputFiles }) => ({
    js: outputFiles.find((f) => f.path.endsWith(".js"))!.text,
    css: outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "",
  }));
  return bundle;
}

/** The lesson the harness plays: one ready video lesson (the fake's 125 s) and a text lesson after it. */
export type PlayerLesson = { clientId: number; slug: string; lessonId: number; nextId: number };

/**
 * A client (written straight to the LOCAL database) with six months of access to an e-course of her own (`e2e-konto-<label>-<project>`,
 * not published; removeClientRows deletes it with its module, lessons and progress) and the terms of version "1" accepted (takeTerms
 * sets that version): module "Alustame" with lesson 1 "Esimene tund", a video lesson with a ready video of 125 s on the fake Bunny
 * (any id: the fake's player checks only the token), and lesson 2, a text lesson.
 */
export async function insertPlayerLesson(email: string): Promise<PlayerLesson> {
  return onLocalDb(
    async (sql) => {
      const [client] = await sql<{ id: number }[]>`insert into clients (email, locale) values (${email}, 'et') returning id`;
      const slug = accountCourseSlug(email);
      const [course] = await sql<{ id: number }[]>`
        insert into courses (slug, type, level, title, summary, body, price, access_months, published)
        values (${slug}, 'e_learning', 'basic', ${sql.json({ et: "E2E õppetunnid", ru: "E2E уроки" })}, ${sql.json({ et: "" })}, ${sql.json({ et: "" })}, 9500, 6, false) returning id`;
      const [m] = await sql<{ id: number }[]>`insert into course_modules (course_id, position, title) values (${course.id}, 1, ${sql.json({ et: "Alustame", ru: "Начинаем" })}) returning id`;
      const [video] = await sql<{ id: number }[]>`
        insert into lessons (module_id, position, title, kind, video_id, video_status, duration_sec)
        values (${m.id}, 1, ${sql.json({ et: "Esimene tund", ru: "Первый урок" })}, 'video', ${crypto.randomUUID()}, 'ready', 125) returning id`;
      const [text] = await sql<{ id: number }[]>`insert into lessons (module_id, position, title, kind) values (${m.id}, 2, ${sql.json({ et: "Teine tund" })}, 'text') returning id`;
      await sql`insert into course_access (client_id, course_id, granted_by, expires_at) values (${client.id}, ${course.id}, 'e2e', now() + interval '6 months')`;
      await sql`insert into terms_acceptances (client_id, course_id, terms_version) values (${client.id}, ${course.id}, '1')`;
      return { clientId: client.id, slug, lessonId: video.id, nextId: text.id };
    },
    { marksPages: false },
  );
}

/** A saved point for the student, as earlier reports would have left it (watched `watchedSec`, not done). */
export async function setProgress(clientId: number, lessonId: number, watchedSec: number): Promise<void> {
  await onLocalDb((sql) => sql`insert into lesson_progress (client_id, lesson_id, watched_sec) values (${clientId}, ${lessonId}, ${watchedSec})`, { marksPages: false });
}

/** The student's progress on a lesson: the furthest second stored and whether it is done; null before the first report. */
export async function storedProgress(clientId: number, lessonId: number): Promise<{ watchedSec: number; done: boolean } | null> {
  const [row] = await onLocalDb(
    (sql) => sql<{ watchedSec: number; done: boolean }[]>`
      select watched_sec as "watchedSec", done_at is not null as done from lesson_progress where client_id = ${clientId} and lesson_id = ${lessonId}`,
    { marksPages: false },
  );
  return row ?? null;
}

/** What the lesson API gives the page for a ready video (lesson-data.ts LessonView), read with the student's session. */
export type ReadyLesson = { module: { title: { et: string; ru?: string } }; lesson: { title: { et: string; ru?: string } }; video: { state: "ready"; embedUrl: string; durationSec: number; resumeAt: number }; watermark: string };

export async function readyLesson(page: Page, lesson: PlayerLesson): Promise<ReadyLesson> {
  const res = await page.request.get(`/api/konto/kursus/${lesson.slug}/${lesson.lessonId}`);
  if (res.status() !== 200) throw new Error(`e2e: the lesson API answered ${res.status()}`);
  const view = (await res.json()) as ReadyLesson;
  if (view.video?.state !== "ready") throw new Error("e2e: the lesson's video is not ready");
  return view;
}

/**
 * Opens the harness on `page` with the player of `view` (the lesson API's answer), in `locale`, the video's embed URL replaced when
 * asked (a token Bunny refuses: no "ready" ever comes). `page` must be on a page of the site: its stylesheets and font classes are
 * the harness's too.
 */
export async function openPlayerHarness(page: Page, lesson: PlayerLesson, view: ReadyLesson, opts: { locale?: "et" | "ru"; embedUrl?: string } = {}): Promise<void> {
  const locale = opts.locale ?? "et";
  const { js, css } = await harnessBundle();
  const site = await page.evaluate(() => ({
    fonts: document.documentElement.className,
    styles: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href),
  }));
  const props: HarnessProps = {
    locale,
    slug: lesson.slug,
    lessonId: lesson.lessonId,
    module: view.module.title[locale] ?? view.module.title.et,
    title: view.lesson.title[locale] ?? view.lesson.title.et,
    video: { embedUrl: opts.embedUrl ?? view.video.embedUrl, durationSec: view.video.durationSec, resumeAt: view.video.resumeAt },
    watermark: view.watermark,
    done: false,
  };
  const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const html = `<!doctype html>
<html lang="${locale}" class="${attr(site.fonts)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Player harness</title>
${site.styles.map((href) => `<link rel="stylesheet" href="${attr(href)}">`).join("\n")}
<link rel="stylesheet" href="${HARNESS_PATH}.css">
</head><body><main id="harness"></main>
<script type="application/json" id="harness-props">${JSON.stringify(props).replace(/</g, "\\u003c")}</script>
<script type="module" src="${HARNESS_PATH}.js"></script>
</body></html>`;
  // A page answered by Playwright's router has no server address, so Chromium counts it as a public page and keeps its frame from
  // the fake Bunny on localhost (Local Network Access, net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS). The real lesson page comes
  // from localhost itself in the e2e run, and from the public site to Bunny's public player live: neither needs this.
  await page.context().grantPermissions(["local-network-access"]);
  await page.unroute(`**${HARNESS_PATH}*`);
  await page.route(`**${HARNESS_PATH}*`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `${HARNESS_PATH}.js`) return route.fulfill({ contentType: "text/javascript; charset=utf-8", body: js });
    if (path === `${HARNESS_PATH}.css`) return route.fulfill({ contentType: "text/css; charset=utf-8", body: css });
    return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
  });
  await page.goto(HARNESS_PATH);
}
