import { cache } from "react";
import { getDb } from "@/db/client";
import { getSettings } from "@/db/queries/public";

/** The settings table, read once per render: the site layout (footer) and several pages need it. */
export const getSiteSettings = cache((): Promise<Record<string, unknown>> => getSettings(getDb()));
