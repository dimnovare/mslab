import { getDb } from "@/db/client";
import { getSettings } from "@/db/queries/public";
import { perRequest } from "./per-request";

/** The settings table, read once per request: the site layout (footer) and several pages need it. */
export const getSiteSettings = perRequest((): Promise<Record<string, unknown>> => getSettings(getDb()));
