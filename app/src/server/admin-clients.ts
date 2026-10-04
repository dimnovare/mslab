import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { listRegistrations, paged, type Paged, type RegistrationRow } from "@/db/queries/admin";
import { clients, courseAccess, courses, registrations, requests, termsAcceptances } from "@/db/schema";
import { cardTitle, cardWhen, type AccountCard } from "@/domain/account-cards";
import { accessState, defaultExpiryDate, grantExpiry, type AccessState } from "@/domain/client-access";
import { isEmail, normalizeEmail } from "@/domain/email";
import { containsPattern, PAGE_SIZE } from "@/domain/paging";
import type { I18n } from "@/i18n/field";
import { getDict } from "@/i18n/locales";
import { linkClientRecords, lockAddress } from "./client-auth";
import { field } from "./edit-check";

// The admin's Õpilased (students): the list, one student's drawer, adding a student by e-mail, and e-course access
// ("Ava ligipääs" / "Lõpeta ligipääs"). Callers have already checked the admin session (server/actions/admin-clients.ts
// wraps each form in adminAction; the pages call requireAdmin); these take a Db and run without Next.js
// (tests/db/admin-clients.test.ts).
//
// A student's NAME as the admin sees it: the name in the account (Minu andmed), or else the name on her latest
// registration (most students never fill in Minu andmed), or nothing. Her number of COURSES: every registration linked to
// her (any status, cancelled ones too) plus every e-course access row (open, run out or ended): what her drawer lists.

export type ClientFilter = "all" | "e" | "k";
export type ClientListRow = { id: number; email: string; name: string; createdAt: Date; courses: number };

// Written out with the table's name: in a single-table query Drizzle prints a column without its table, which inside these
// subqueries would be the subquery's own column (registrations.id, not the client's).
const NAME = sql<string>`coalesce(nullif(clients.name, ''), (select r.name from registrations r where r.client_id = clients.id order by r.created_at desc, r.id desc limit 1), '')`;
const COURSES = sql<number>`((select count(*) from registrations r where r.client_id = clients.id) + (select count(*) from course_access a where a.client_id = clients.id))::int`;
const HAS_ACCESS = sql`exists (select 1 from course_access a where a.client_id = clients.id)`;
const HAS_CONTACT = sql`exists (select 1 from registrations r join courses c on c.id = r.course_id where r.client_id = clients.id and c.type = 'contact')`;

function clientWhere(filter: ClientFilter, q: string) {
  const search = q ? sql`(clients.email ilike ${containsPattern(q)} or ${NAME} ilike ${containsPattern(q)})` : undefined;
  return and(filter === "e" ? HAS_ACCESS : filter === "k" ? HAS_CONTACT : undefined, search);
}

/**
 * One page of the students, newest first. `filter`: "e" those with any e-course access, "k" those with a registration on
 * a contact course, "all" everybody. `q`: a part of the name or the e-mail, any case, taken literally.
 */
export async function listClients(db: Db, opts: { filter: ClientFilter; q: string; page: number }, size: number = PAGE_SIZE): Promise<Paged<ClientListRow>> {
  const where = clientWhere(opts.filter, opts.q);
  return paged(
    opts.page,
    size,
    async () => {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(clients).where(where);
      return Number(n);
    },
    (range) =>
      db
        .select({ id: clients.id, email: clients.email, name: NAME, createdAt: clients.createdAt, courses: COURSES })
        .from(clients)
        .where(where)
        .orderBy(desc(clients.createdAt), desc(clients.id))
        .limit(range.limit)
        .offset(range.offset),
  );
}

// ---------- one student ----------

export type ClientAccessRow = {
  id: number;
  courseId: number;
  title: I18n;
  slug: string;
  grantedBy: string;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  state: AccessState;
};
export type ClientRequestRow = { id: number; kind: (typeof requests.$inferSelect)["kind"]; handled: boolean; createdAt: Date; wish: "cancel" | "change" | null };
export type ClientDetail = {
  client: { id: number; email: string; name: string; ownName: string; phone: string; locale: "et" | "ru"; createdAt: Date };
  registrations: RegistrationRow[];
  requests: ClientRequestRow[];
  access: ClientAccessRow[];
  terms: { courseTitle: I18n; version: string; acceptedAt: Date }[];
};

/** Everything the student's drawer shows, or null when there is no such student. Newest first in every list. */
export async function clientDetail(db: Db, id: number, now: Date = new Date()): Promise<ClientDetail | null> {
  const [[client], regs, reqs, access, terms] = await Promise.all([
    db
      .select({ id: clients.id, email: clients.email, name: NAME, ownName: clients.name, phone: clients.phone, locale: clients.locale, createdAt: clients.createdAt })
      .from(clients)
      .where(eq(clients.id, id))
      .limit(1),
    listRegistrations(db, { clientId: id }),
    db
      .select({ id: requests.id, kind: requests.kind, handled: requests.handled, createdAt: requests.createdAt, wish: sql<string | null>`${requests.payload}->>'kind'` })
      .from(requests)
      .where(eq(requests.clientId, id))
      .orderBy(desc(requests.createdAt), desc(requests.id)),
    db
      .select({
        id: courseAccess.id,
        courseId: courseAccess.courseId,
        title: courses.title,
        slug: courses.slug,
        grantedBy: courseAccess.grantedBy,
        grantedAt: courseAccess.grantedAt,
        expiresAt: courseAccess.expiresAt,
        revokedAt: courseAccess.revokedAt,
      })
      .from(courseAccess)
      .innerJoin(courses, eq(courseAccess.courseId, courses.id))
      .where(eq(courseAccess.clientId, id))
      .orderBy(desc(courseAccess.grantedAt), desc(courseAccess.id)),
    db
      .select({ courseTitle: courses.title, version: termsAcceptances.termsVersion, acceptedAt: termsAcceptances.acceptedAt })
      .from(termsAcceptances)
      .innerJoin(courses, eq(termsAcceptances.courseId, courses.id))
      .where(eq(termsAcceptances.clientId, id))
      .orderBy(desc(termsAcceptances.acceptedAt)),
  ]);
  if (!client) return null;
  return {
    client,
    registrations: regs,
    requests: reqs.map((r) => ({ ...r, wish: r.kind === "change_request" && (r.wish === "cancel" || r.wish === "change") ? r.wish : null })),
    access: access.map((a) => ({ ...a, state: accessState(a, now) })),
    terms,
  };
}

/** A name for the admin's headings and the "view as" banner: the student's name (as in the list), or her e-mail. */
export async function clientLabel(db: Db, id: number): Promise<string | null> {
  const [row] = await db.select({ email: clients.email, name: NAME }).from(clients).where(eq(clients.id, id)).limit(1);
  return row ? row.name.trim() || row.email : null;
}

export type EcourseOption = { id: number; title: I18n; published: boolean; accessMonths: number | null; until: string };

/** The e-courses access can be granted to (drafts too: a course bought before it is published), in the public order, each with its default expiry date. */
export async function listEcourses(db: Db, now: Date = new Date()): Promise<EcourseOption[]> {
  const rows = await db
    .select({ id: courses.id, title: courses.title, published: courses.published, accessMonths: courses.accessMonths })
    .from(courses)
    .where(eq(courses.type, "e_learning"))
    .orderBy(asc(courses.sort), asc(courses.id));
  return rows.map((c) => ({ ...c, until: defaultExpiryDate(now, c.accessMonths) }));
}

// ---------- a registration as the student's card names it (the drawer, the change requests in Päringud) ----------

/** A registration as the account's card (domain/account-cards.ts), so the admin names it as the student sees it. */
export function registrationCard(r: RegistrationRow): AccountCard {
  const course = { slug: r.course.slug, title: r.course.title };
  const createdAt = r.createdAt.toISOString();
  if (!r.courseSession) return { kind: "individual", registrationId: r.id, course, status: r.status, preferredPeriod: r.preferredPeriod, createdAt };
  const s = r.courseSession;
  return {
    kind: "contact",
    registrationId: r.id,
    course,
    session: { startsAt: s.startsAt.toISOString(), city: s.city, venue: s.venue, cancelled: s.status === "cancelled" },
    status: r.status,
    paymentChoice: r.paymentChoice,
    priceCents: null,
    paidCents: r.paidCents,
    createdAt,
  };
}

/** The course of a registration and when it is ("14.11.2026 · 10:00", Pärnu…), in Estonian, through the account's own cardTitle and cardWhen. */
export function registrationHeading(r: RegistrationRow): { title: string; time: string; place: string } {
  const card = registrationCard(r);
  const when = cardWhen(card, "et");
  return { title: cardTitle(card, "et", getDict("et").account.dashboard.untitled), time: when?.time ?? "", place: when?.place ?? "" };
}

// ---------- the forms ----------

/** What a Õpilased form gets back. `id`: the student added (or found). */
export type ClientResult = { ok: true; id?: number } | { ok: false; error: "invalid" | "email" | "notFound" | "course" | "date" | "server" };

const fail = (error: Exclude<ClientResult, { ok: true }>["error"]): ClientResult => ({ ok: false, error });
const idSchema = z.coerce.number().int().positive().max(2_147_483_647);

/**
 * "Lisa õpilane": the student of this address, created when there is none (no session, no e-mail sent), so an e-course
 * can be opened for someone who has never logged in (bought by bank transfer). Under the address lock the logins take
 * (client-auth.ts lockAddress), so a login at the same moment cannot create her twice. A new student's language is the
 * one of her latest registration, else Estonian; her earlier registrations, requests and newsletter row are linked to
 * her as a login would link them. On her first login the login finds her (not new) and links anything newer.
 */
export async function addClient(db: Db, raw: string): Promise<{ ok: true; id: number; created: boolean } | { ok: false; error: "email" }> {
  const address = normalizeEmail(raw);
  if (!isEmail(address)) return { ok: false, error: "email" };
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    await lockAddress(t, address);
    const [existing] = await t.select({ id: clients.id }).from(clients).where(eq(clients.email, address)).limit(1);
    if (existing) return { ok: true as const, id: existing.id, created: false };
    const [latest] = await t
      .select({ locale: registrations.locale })
      .from(registrations)
      .where(sql`lower(${registrations.email}) = ${address}`)
      .orderBy(desc(registrations.createdAt), desc(registrations.id))
      .limit(1);
    const [row] = await t.insert(clients).values({ email: address, locale: latest?.locale === "ru" ? "ru" : "et" }).returning();
    await linkClientRecords(t, row.id, address);
    return { ok: true as const, id: row.id, created: true };
  });
}

/** Field: email. */
export async function addClientForm(db: Db, formData: FormData): Promise<ClientResult> {
  const result = await addClient(db, field(formData, "email") ?? "");
  return result.ok ? { ok: true, id: result.id } : fail("email");
}

/**
 * "Ava ligipääs": the student may open the e-course until the end of `until` (an Estonian date, today at the earliest).
 * One row per student and course: granting again (after it ran out or was ended) moves the expiry, clears the end and
 * records who granted it and when. Only e-learning courses, drafts included.
 */
export async function grantAccess(
  db: Db,
  input: { clientId: number; courseId: number; until: string; by: string; now: Date },
): Promise<ClientResult> {
  const expiresAt = grantExpiry(input.until, input.now);
  if (!expiresAt) return fail("date");
  const [[course], [client]] = await Promise.all([
    db.select({ type: courses.type }).from(courses).where(eq(courses.id, input.courseId)).limit(1),
    db.select({ id: clients.id }).from(clients).where(eq(clients.id, input.clientId)).limit(1),
  ]);
  if (!client) return fail("notFound");
  if (course?.type !== "e_learning") return fail("course");
  const values = { grantedBy: input.by, grantedAt: input.now, expiresAt, revokedAt: null };
  await db
    .insert(courseAccess)
    .values({ clientId: input.clientId, courseId: input.courseId, ...values })
    .onConflictDoUpdate({ target: [courseAccess.clientId, courseAccess.courseId], set: values });
  return { ok: true };
}

/** Fields: clientId, courseId, until (yyyy-mm-dd). `by`: the signed-in admin's e-mail. */
export async function grantAccessForm(db: Db, formData: FormData, by: string, now: Date): Promise<ClientResult> {
  const clientId = idSchema.safeParse(field(formData, "clientId"));
  if (!clientId.success) return fail("invalid");
  const courseId = idSchema.safeParse(field(formData, "courseId"));
  if (!courseId.success) return fail("course");
  return grantAccess(db, { clientId: clientId.data, courseId: courseId.data, until: (field(formData, "until") ?? "").trim(), by, now });
}

/** "Lõpeta ligipääs": the access ends now (kept in the drawer as ended). Ending one already ended changes nothing. */
export async function revokeAccess(db: Db, input: { clientId: number; accessId: number; now: Date }): Promise<ClientResult> {
  const mine = and(eq(courseAccess.id, input.accessId), eq(courseAccess.clientId, input.clientId));
  const [row] = await db.update(courseAccess).set({ revokedAt: input.now }).where(and(mine, isNull(courseAccess.revokedAt))).returning();
  if (row) return { ok: true };
  const [exists] = await db.select({ id: courseAccess.id }).from(courseAccess).where(mine).limit(1);
  return exists ? { ok: true } : fail("notFound");
}

/** Fields: clientId, accessId. */
export async function revokeAccessForm(db: Db, formData: FormData, now: Date): Promise<ClientResult> {
  const clientId = idSchema.safeParse(field(formData, "clientId"));
  const accessId = idSchema.safeParse(field(formData, "accessId"));
  if (!clientId.success || !accessId.success) return fail("invalid");
  return revokeAccess(db, { clientId: clientId.data, accessId: accessId.data, now });
}
