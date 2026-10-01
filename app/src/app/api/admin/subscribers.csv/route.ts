import { getDb } from "@/db/client";
import { listSubscribers } from "@/db/queries/admin";
import { subscribersCsv, subscribersCsvName } from "@/server/admin";
import { withAdmin } from "@/server/auth";
import { logFailure } from "@/server/log";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/subscribers.csv — the newsletter subscribers as a CSV download (signed-in admins only: 401 JSON
 * otherwise). `?kinnitatud=1`: only the addresses whose owner confirmed the subscription (the ones a newsletter may go
 * to). Never cached; formula-like cells are defused (server/csv.ts).
 */
export const GET = withAdmin(async (request) => {
  const confirmedOnly = new URL(request.url).searchParams.get("kinnitatud") === "1";
  try {
    const body = subscribersCsv(await listSubscribers(getDb()), { confirmedOnly });
    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${subscribersCsvName(new Date(), confirmedOnly)}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    logFailure("[admin] subscriber export failed", e);
    return Response.json({ ok: false, error: "server" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
});
