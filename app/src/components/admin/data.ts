import { getDb } from "@/db/client";
import { adminCounts } from "@/db/queries/admin";
import { perRequest } from "@/server/per-request";

/** The overview numbers and menu badges, read once per request (the shell and the overview page share them). */
export const getAdminCounts = perRequest(() => adminCounts(getDb()));
