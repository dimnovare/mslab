import { cache } from "react";
import { getDb } from "@/db/client";
import { adminCounts } from "@/db/queries/admin";

/** The overview numbers and menu badges, read once per request (the shell and the overview page share them). */
export const getAdminCounts = cache(() => adminCounts(getDb()));
