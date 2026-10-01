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

export const FIXTURES = {
  full: { slug: "kulmude-lami", city: "Pärnu", leave: 0 },
  few: { slug: "lash-lift-botox", city: "Viljandi", leave: 2 },
} as const;

const connect = () => postgres(DB_URL, { max: 1, connect_timeout: 5, onnotice: () => {} });

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
