import postgres from "postgres";

// Test-owned seat fixtures for the calendar e2e tests. The seed never contains registrations (the real database will
// hold real ones), so the "full" and "few" seat states are produced here: global-setup inserts confirmed registrations
// into the LOCAL dev database only, global-teardown removes them again. Every row carries FIXTURE_NOTE.
//
// The two sessions are chosen so that no other test depends on their seats:
// - full: Kulmude LAMI, Pärnu (the course's later date; the Tartu one stays open);
// - few:  Lash Lift BOTOX, Viljandi (2 seats left — still bookable, so the course page's radio tests are unaffected).

const baseURL = process.env.E2E_BASE_URL ?? "";

/** Fixtures are applied only when the tests run against a local server (the default `npm run dev`). */
export const LOCAL_FIXTURES = !baseURL || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(baseURL);

export const FIXTURE_NOTE = "e2e-fixture:seats";
const DB_URL = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/mslab";

/** Fixtures and test rows are written to and deleted from a local database only, never a shared one. */
function assertLocalDb(url: string): void {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) throw new Error(`e2e: refusing to use a non-local database (${host})`);
}

export const FIXTURES = {
  full: { slug: "kulmude-lami", city: "Pärnu", leave: 0 },
  few: { slug: "lash-lift-botox", city: "Viljandi", leave: 2 },
} as const;

const connect = () => {
  assertLocalDb(DB_URL);
  return postgres(DB_URL, { max: 1, connect_timeout: 5, onnotice: () => {} });
};

/** Removes this suite's rows; returns how many are left afterwards (0 when clean). */
async function clear(sql: postgres.Sql): Promise<number> {
  await sql`delete from registrations where note = ${FIXTURE_NOTE}`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from registrations where note = ${FIXTURE_NOTE}`;
  return n;
}

export async function applySeatFixtures(): Promise<void> {
  const sql = connect();
  try {
    await clear(sql); // leftovers of an interrupted run
    for (const f of Object.values(FIXTURES)) {
      const [s] = await sql<{ id: number; courseId: number; capacity: number; confirmed: number }[]>`
        select s.id, s.course_id as "courseId", s.capacity,
               (select count(*)::int from registrations r where r.course_session_id = s.id and r.status = 'confirmed') as confirmed
        from course_sessions s join courses c on c.id = s.course_id
        where c.slug = ${f.slug} and s.city = ${f.city} and s.status = 'scheduled'
        order by s.starts_at limit 1`;
      if (!s) throw new Error(`e2e fixtures: no scheduled ${f.slug} session in ${f.city} — is the local DB seeded?`);
      const missing = Math.max(0, s.capacity - f.leave - s.confirmed);
      for (let i = 0; i < missing; i++) {
        await sql`insert into registrations (course_id, course_session_id, kind, name, email, payment_choice, status, note)
                  values (${s.courseId}, ${s.id}, 'group', 'E2E fixture', 'e2e-fixture@example.com', 'full', 'confirmed', ${FIXTURE_NOTE})`;
      }
    }
  } finally {
    await sql.end();
  }
}

export async function removeSeatFixtures(): Promise<void> {
  const sql = connect();
  try {
    const left = await clear(sql);
    if (left !== 0) throw new Error(`e2e fixtures: ${left} fixture registrations are still in the database`);
  } finally {
    await sql.end();
  }
}

// ---------- rows the form tests create ----------
// Every e-mail a test submits is `e2e-form-…@example.com` (see testEmail); the tests read the stored rows back from the
// local database, and global-setup / global-teardown delete them.

export const TEST_EMAIL_PATTERN = "e2e-form-%@example.com";

/** A unique address for one submission: e2e-form-<label>-<project>-<time><random>@example.com (lowercase). */
export function testEmail(label: string, project: string): string {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `e2e-form-${label}-${project}-${unique}@example.com`.toLowerCase();
}

/** Deletes the form tests' rows; returns how many are left (0 when clean). */
export async function removeFormRows(): Promise<number> {
  const sql = connect();
  try {
    await sql`delete from registrations where email like ${TEST_EMAIL_PATTERN}`;
    await sql`delete from requests where payload->>'email' like ${TEST_EMAIL_PATTERN}`;
    await sql`delete from subscribers where email like ${TEST_EMAIL_PATTERN}`;
    const [{ n }] = await sql<{ n: number }[]>`
      select (select count(*) from registrations where email like ${TEST_EMAIL_PATTERN})
           + (select count(*) from requests where payload->>'email' like ${TEST_EMAIL_PATTERN})
           + (select count(*) from subscribers where email like ${TEST_EMAIL_PATTERN})::int as n`;
    return Number(n);
  } finally {
    await sql.end();
  }
}

export type StoredRegistration = { kind: string; status: string; paidCents: number; paymentChoice: string; wantsModelHelp: boolean; locale: string; course: string; sessionId: number | null };
export type StoredRequest = { kind: string; payload: Record<string, unknown> };
export type StoredSubscriber = { email: string; locale: string; confirmed: boolean; token: string };

/** The registrations stored for one test address. */
export async function storedRegistrations(email: string): Promise<StoredRegistration[]> {
  const sql = connect();
  try {
    return await sql<StoredRegistration[]>`
      select r.kind, r.status, r.paid_cents as "paidCents", r.payment_choice as "paymentChoice",
             r.wants_model_help as "wantsModelHelp", r.locale, c.slug as course, r.course_session_id as "sessionId"
      from registrations r join courses c on c.id = r.course_id where r.email = ${email} order by r.id`;
  } finally {
    await sql.end();
  }
}

/** The requests stored for one test address. */
export async function storedRequests(email: string): Promise<StoredRequest[]> {
  const sql = connect();
  try {
    return await sql<StoredRequest[]>`select kind, payload from requests where payload->>'email' = ${email} order by id`;
  } finally {
    await sql.end();
  }
}

/** The newsletter subscriber of one test address, if any. */
export async function storedSubscriber(email: string): Promise<StoredSubscriber | null> {
  const sql = connect();
  try {
    const [row] = await sql<StoredSubscriber[]>`select email, locale, confirmed_at is not null as confirmed, token from subscribers where email = ${email}`;
    return row ?? null;
  } finally {
    await sql.end();
  }
}
