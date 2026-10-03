// The registrations this browser tab has sent "Tühista või muuda aega" for, kept in sessionStorage so that the card still
// says "Saadetud. Maria võtab sinuga ühendust." after a reload, instead of offering the button again. Per tab and only
// for this visit (the request itself is in Maria's inbox); "Logi välja" forgets them. Blocked storage simply keeps nothing.

export const SENT_KEY = "mslab-change-sent";

/** The registration ids sent from this tab ([] when none, or storage is blocked or holds something else). */
export function sentChangeRequests(): number[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(SENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is number => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

/** Remembers that a request was sent for this registration. */
export function rememberChangeRequest(registrationId: number): void {
  try {
    sessionStorage.setItem(SENT_KEY, JSON.stringify([...new Set([...sentChangeRequests(), registrationId])]));
  } catch {
    // private mode or blocked storage: the card shows "Saadetud" until the page is loaded again
  }
}

/** Forgets every sent request (logging out). */
export function forgetChangeRequests(): void {
  try {
    sessionStorage.removeItem(SENT_KEY);
  } catch {
    // nothing kept
  }
}
