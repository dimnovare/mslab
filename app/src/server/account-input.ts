import { z } from "zod";

// The bodies of the client account's data endpoints (account-api.ts), parsed without trusting anything: a wrong type, a value
// that is too long or text the database cannot store gives `{ ok: false, error: "<field>" }` (the endpoint's 400), never an
// exception and never a database error. The limits are the endpoints' contract:
// name 120, phone 40, message 1000, slugs 200 (at most 100 in a merge), language et or ru, kind cancel or change.

export type Input<T> = { ok: true; data: T } | { ok: false; error: string };

export const LIMITS = { name: 120, phone: 40, message: 1000, slug: 200, mergeSlugs: 100, version: 64 } as const;

/** Postgres rejects a NUL character in text, and a lone surrogate in a jsonb value (the change request's message): both would be a 500. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const storable = (s: string): boolean => !CONTROL.test(s) && !LONE_SURROGATE.test(s);

/** One line: inner whitespace (newlines too) becomes single spaces, the ends are trimmed. May be empty. */
const line = (max: number) =>
  z.string().transform((s) => s.replace(/\s+/g, " ").trim()).pipe(z.string().max(max).refine(storable));

/** Free text, line breaks kept, the ends trimmed. May be empty. */
const text = (max: number) => z.string().transform((s) => s.trim()).pipe(z.string().max(max).refine(storable));

const slug = z.string().min(1).max(LIMITS.slug).refine(storable);
/** A row id: a JSON whole number that fits the database's integer. */
const rowId = z.number().int().positive().max(2_147_483_647);

const favourite = z.object({ slug, on: z.boolean() });
const merge = z.object({ slugs: z.array(slug).max(LIMITS.mergeSlugs) });
const profile = z.object({ name: line(LIMITS.name), phone: line(LIMITS.phone), locale: z.enum(["et", "ru"]) });
const newsletter = z.object({ on: z.boolean() });
const changeRequest = z.object({ registrationId: rowId, kind: z.enum(["cancel", "change"]), message: text(LIMITS.message).optional().transform((m) => m ?? "") });
const terms = z.object({ slug, version: z.string().min(1).max(LIMITS.version).refine(storable) });
const deletion = z.object({ confirm: z.literal(true) });

export type FavouriteInput = z.infer<typeof favourite>;
export type MergeInput = z.infer<typeof merge>;
export type ProfileInput = z.infer<typeof profile>;
export type NewsletterInput = z.infer<typeof newsletter>;
export type ChangeRequestInput = z.infer<typeof changeRequest>;
export type TermsInput = z.infer<typeof terms>;

/** `body` (the parsed JSON, or null when it was not an object) against `schema`; the first wrong field is the error ("body" when it is not an object at all). */
function parse<S extends z.ZodType>(schema: S, body: unknown): Input<z.infer<S>> {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const field = result.error.issues[0]?.path[0];
  return { ok: false, error: typeof field === "string" ? field : "body" };
}

export const parseFavourite = (body: unknown) => parse(favourite, body);
export const parseMerge = (body: unknown) => parse(merge, body);
export const parseProfile = (body: unknown) => parse(profile, body);
export const parseNewsletter = (body: unknown) => parse(newsletter, body);
export const parseChangeRequest = (body: unknown) => parse(changeRequest, body);
export const parseTerms = (body: unknown) => parse(terms, body);
export const parseDeletion = (body: unknown) => parse(deletion, body);

/** The course slug of a request path (still percent-encoded), or null when it cannot be a slug (not decodable, empty, too long, text the database cannot hold). */
export function parseSlug(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const result = slug.safeParse(decoded);
  return result.success ? result.data : null;
}
