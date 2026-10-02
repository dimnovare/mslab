import { describe, expect, test } from "vitest";
import { addDays, seedBaseDate, SEED_LEAD_DAYS, seedSessionStart } from "@/db/seed-dates";

// The sample sessions are dated relative to the seed day (Task 16 item 4): the calendar of a fresh seed, and of the
// e2e run's local database, is always upcoming.

describe("sample session dates", () => {
  test("made on 1-3 October 2026 the first date is prototype D's 14.11.2026; a day later it moves a week on", () => {
    expect(seedBaseDate(new Date("2026-10-01T09:00:00Z"))).toBe("2026-11-14");
    expect(seedBaseDate(new Date("2026-10-02T09:00:00Z"))).toBe("2026-11-14");
    expect(seedBaseDate(new Date("2026-10-03T09:00:00Z"))).toBe("2026-11-14"); // a Saturday, exactly 42 days on
    expect(seedBaseDate(new Date("2026-10-04T09:00:00Z"))).toBe("2026-11-21");
  });

  test("the day is the Estonian one: 00:30 in Tallinn is still the previous day in UTC", () => {
    expect(seedBaseDate(new Date("2026-10-03T21:30:00Z"))).toBe("2026-11-21"); // 04.10 00:30 in Tallinn
  });

  test("always a Saturday, 42 to 48 days ahead, on every day of three years", () => {
    for (let t = Date.UTC(2026, 9, 1, 12); t < Date.UTC(2029, 9, 1); t += 86_400_000) {
      const now = new Date(t);
      const base = seedBaseDate(now);
      const [y, m, d] = base.split("-").map(Number);
      expect(new Date(Date.UTC(y, m - 1, d)).getUTCDay(), base).toBe(6);
      const days = (Date.UTC(y, m - 1, d) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000;
      expect(days).toBeGreaterThanOrEqual(SEED_LEAD_DAYS);
      expect(days).toBeLessThanOrEqual(SEED_LEAD_DAYS + 6);
    }
  });

  test("sessions start at 10:00 Estonian time, winter or summer", () => {
    const oct = new Date("2026-10-01T09:00:00Z");
    expect(seedSessionStart(oct, 0).toISOString()).toBe("2026-11-14T08:00:00.000Z");
    expect(seedSessionStart(oct, 70).toISOString()).toBe("2027-01-23T08:00:00.000Z");
    expect(seedSessionStart(new Date("2027-04-20T09:00:00Z"), 0).toISOString()).toBe("2027-06-05T07:00:00.000Z");
    expect(seedSessionStart(oct, 0, "11:30").toISOString()).toBe("2026-11-14T09:30:00.000Z");
  });

  test("addDays crosses months and years", () => {
    expect(addDays("2026-11-14", 63)).toBe("2027-01-16");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-01-10", -10)).toBe("2025-12-31");
  });
});
