// Failure logging without personal data. Error messages are never logged: a DrizzleQueryError message carries the
// query parameters (names, e-mails, phone numbers, messages, newsletter tokens), a Resend error can quote the
// recipient, and a fetch error can contain the request URL (with the bot token). Only these are kept: the error class,
// a short machine code (SQLSTATE such as 23505, or a provider error name) and an HTTP status.

const SHORT_CODE = /^[A-Za-z0-9_.-]{1,40}$/;

type Inspectable = { name?: unknown; code?: unknown; status?: unknown; statusCode?: unknown; cause?: unknown };

function className(e: unknown): string {
  if (e instanceof Error) {
    const ctor = e.constructor?.name;
    const name = ctor && ctor !== "Error" ? ctor : e.name;
    return typeof name === "string" && SHORT_CODE.test(name) ? name : "Error";
  }
  const name = typeof e === "object" && e !== null ? (e as Inspectable).name : undefined;
  if (typeof name === "string" && SHORT_CODE.test(name)) return name; // e.g. a Resend error object: "validation_error"
  return e === null ? "null" : typeof e;
}

const shortCode = (v: unknown) => (typeof v === "string" && SHORT_CODE.test(v) ? v : typeof v === "number" ? String(v) : undefined);
const status = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : undefined);

/** "DrizzleQueryError (code 42P01)", "TimeoutError", "application_error (status 422)" — never the message. */
export function errorSummary(e: unknown): string {
  const outer = (typeof e === "object" && e !== null ? e : {}) as Inspectable;
  const cause = (typeof outer.cause === "object" && outer.cause !== null ? outer.cause : {}) as Inspectable;
  const code = shortCode(outer.code) ?? shortCode(cause.code);
  const http = status(outer.status) ?? status(outer.statusCode) ?? status(cause.status) ?? status(cause.statusCode);
  const details = [code && `code ${code}`, http && `status ${http}`].filter(Boolean).join(", ");
  return details ? `${className(e)} (${details})` : className(e);
}

/** console.error with the place and the summary only. */
export function logFailure(where: string, e: unknown): void {
  console.error(`${where}: ${errorSummary(e)}`);
}

/** console.error with a fixed message and nothing else: for a state that is not an error object, such as missing configuration. */
export function logNote(message: string): void {
  console.error(message);
}
