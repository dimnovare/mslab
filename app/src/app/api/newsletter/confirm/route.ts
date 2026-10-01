import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { logFailure } from "@/server/log";
import { confirmSubscriber } from "@/server/submit";

/**
 * Newsletter double opt-in: the link in the confirmation e-mail (`?t=<token>`). Sets `confirmedAt` and sends the
 * visitor to the home page in the locale they signed up in, which shows a notice:
 * ?uudiskiri=kinnitatud (confirmed), =vigane (unknown token), =viga (the database could not be reached).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let outcome: "kinnitatud" | "vigane" | "viga" = "vigane";
  let home = "/";
  try {
    const sub = await confirmSubscriber(getDb(), url.searchParams.get("t") ?? "", new Date());
    if (sub) {
      outcome = "kinnitatud";
      if (sub.locale === "ru") home = "/ru";
    }
  } catch (e) {
    logFailure("[newsletter] confirm failed", e); // never the message: it would contain the token
    outcome = "viga";
  }
  const target = new URL(home, url.origin);
  target.searchParams.set("uudiskiri", outcome);
  const res = NextResponse.redirect(target, 303);
  res.headers.set("cache-control", "no-store");
  return res;
}
