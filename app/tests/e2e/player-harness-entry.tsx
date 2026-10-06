// The browser side of the player's e2e harness (player-harness.ts bundles this file): LessonPlayer alone on a page of the site's
// origin, with props from the page's JSON (the lesson API's answer, read by the test), under the lesson's module and title as the
// lesson page will show them. The server's answers to the reports end in the done line "Õppetund tehtud ✓", as on the lesson page.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
// the site's primitives first, as in the app (the page's padding wins over .wrap's)
import ui from "@/components/site/ui.module.css";
import page from "@/components/account/EcoursePage.module.css";
import { LessonPlayer } from "@/components/account/LessonPlayer";
import { lessonTexts } from "@/components/account/texts";
import type { VideoShape } from "@/domain/lessons";
import { getDict, type Locale } from "@/i18n/locales";

export type HarnessProps = {
  locale: Locale;
  slug: string;
  lessonId: number;
  module: string;
  title: string;
  video: { embedUrl: string; durationSec: number; resumeAt: number; shape: VideoShape | null };
  watermark: string;
  done: boolean;
};

function Harness(props: HarnessProps) {
  const t = lessonTexts(getDict(props.locale));
  const [done, setDone] = useState(props.done);
  // what the e2e page fixture waits for on a page of the site (SiteReady.tsx)
  useEffect(() => document.documentElement.setAttribute("data-site-ready", ""), []);
  return (
    <div className={`${ui.wrap} ${page.page}`}>
      <p className={ui.eyebrow}>{props.module}</p>
      <h1 className={page.title}>{props.title}</h1>
      <div style={{ marginTop: 24 }}>
        <LessonPlayer
          slug={props.slug}
          lessonId={props.lessonId}
          title={props.title}
          video={props.video}
          watermark={props.watermark}
          done={props.done}
          t={t}
          onProgress={(answer) => {
            if (answer.done) setDone(true);
          }}
        />
      </div>
      {done && (
        <p role="status" data-harness-done="" style={{ margin: "16px 0 0", font: "500 16px/1.5 var(--font-body)" }}>
          {t.done}
        </p>
      )}
    </div>
  );
}

const props = JSON.parse(document.getElementById("harness-props")!.textContent!) as HarnessProps;
document.documentElement.lang = props.locale;
createRoot(document.getElementById("harness")!).render(<Harness {...props} />);
