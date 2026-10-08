// The rules of the optional client password (phase 2c, spec 7), shared by Minu andmed (the browser) and the server. Pure.

/** The shortest and the longest password, in characters as people count them (code points). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

/** What is wrong with a new password: too short, too long, or the account's own e-mail address. */
export type PasswordProblem = "short" | "long" | "email";

/** The problem with `password` as the password of the account `email`, or null when it is fine. */
export function passwordProblem(password: string, email: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return "short";
  if (length > PASSWORD_MAX) return "long";
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return "email";
  return null;
}
