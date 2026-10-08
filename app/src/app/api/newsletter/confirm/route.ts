import { after, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { welcomeFragment } from "@/domain/welcome-code";
import { serverEnv } from "@/server/env";
import { serverKv } from "@/server/kv";
import { logFailure } from "@/server/log";
import { confirmNewsletter } from "@/server/newsletter";

/**
 * Newsletter double opt-in: the link in the confirmation e-mail (`?t=<token>`). Confirms the subscriber and sends the visitor to the
 * home page in their language, which shows a notice: ?uudiskiri=kinnitatud (confirmed), =vigane (unknown token), =viga (the database
 * could not be reached). The first confirmation with a welcome code set (Seaded "Tervituskood", phase 2c) also mails the code after
 * the response and carries it in the fragment (#kood=<CODE>): the cached home page shows it from there, and no server or cache sees it.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let outcome: "kinnitatud" | "vigane" | "viga" = "vigane";
  let home = "/";
  let code: string | null = null;
  try {
    const result = await confirmNewsletter(
      {
        db: getDb(),
        env: { ...serverEnv(), KV: serverKv() },
        now: new Date(),
        later: (task) => after(() => task().catch((e) => logFailure("[newsletter] welcome e-mail failed", e))),
      },
      url.searchParams.get("t") ?? "",
    );
    outcome = result.outcome;
    if (result.locale === "ru") home = "/ru";
    code = result.code;
  } catch (e) {
    logFailure("[newsletter] confirm failed", e); // never the message: it would contain the token
    outcome = "viga";
  }
  const target = new URL(home, url.origin);
  target.searchParams.set("uudiskiri", outcome);
  if (code) target.hash = welcomeFragment(code);
  const res = NextResponse.redirect(target, 303);
  res.headers.set("cache-control", "no-store");
  return res;
}
