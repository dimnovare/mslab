import { describe, expect, test } from "vitest";
import { serverEnv } from "@/server/env";
import { FORBIDDEN_SETTINGS, forbiddenSettingError, LOCAL_ENV, parseEnvFile } from "../local-secrets";

// What an e2e run refuses to start with (tests/e2e/global-setup.ts reads these files and the environment): anything that
// would make the form tests reach real people, or the upload tests write to the real R2 bucket. The values here are made up.

const R2 = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];

describe("forbiddenSettingError", () => {
  test("the forbidden settings are the two mail secrets and all four R2 variables", () => {
    expect(Object.keys(FORBIDDEN_SETTINGS).sort()).toEqual(["RESEND_API_KEY", "TELEGRAM_BOT_TOKEN", ...R2].sort());
  });

  test("nothing set: the run may go on", () => {
    expect(forbiddenSettingError({}, {})).toBeUndefined();
    expect(forbiddenSettingError({ ".env.local": undefined, ".env": "DATABASE_URL=postgres://u:p@localhost:5432/x\nSITE_URL=https://x.example\n" }, { PATH: "/bin" })).toBeUndefined();
  });

  test("an R2 variable set in an env file stops the run, and the message names it, not its value", () => {
    for (const name of R2) {
      const message = forbiddenSettingError({ ".env.local": `ADMIN_EMAILS=a@example.test\n${name}=fake-value-123\n` }, {})!;
      expect(message, name).toContain(".env.local");
      expect(message, name).toContain(name);
      expect(message, name).toContain("real image bucket");
      expect(message, name).not.toContain("fake-value-123");
    }
  });

  test("so does a mail secret, as before", () => {
    expect(forbiddenSettingError({ ".env": "RESEND_API_KEY=re_fake_key" }, {})).toMatch(/RESEND_API_KEY.*real e-mails/);
    expect(forbiddenSettingError({ ".dev.vars": "TELEGRAM_BOT_TOKEN=1:fake" }, {})).toMatch(/TELEGRAM_BOT_TOKEN.*Telegram/);
  });

  test("an R2 variable in the environment of the run stops it, whatever the files say", () => {
    for (const name of R2) {
      const message = forbiddenSettingError({}, { [name]: "fake-value-123" })!;
      expect(message, name).toContain(name);
      expect(message, name).toContain("environment");
      expect(message, name).not.toContain("fake-value-123");
    }
  });

  test("a commented-out, empty or blank one does not count (.env.example lists them as comments)", () => {
    const text = ["# R2_ACCOUNT_ID=abc", "R2_ACCESS_KEY_ID=", 'R2_SECRET_ACCESS_KEY=""', "R2_BUCKET=''", "#RESEND_API_KEY=x"].join("\n");
    expect(forbiddenSettingError({ ".env.local": text }, { R2_BUCKET: "", R2_ACCOUNT_ID: "  " })).toBeUndefined();
  });

  test("`export NAME=value` and CRLF line ends are read like any other line", () => {
    expect(forbiddenSettingError({ ".env": "export R2_BUCKET=fake-bucket\r\n" }, {})).toContain("R2_BUCKET");
    expect(forbiddenSettingError({ ".env": "A=1\r\nR2_ACCOUNT_ID=abc\r\n" }, {})).toContain("R2_ACCOUNT_ID");
    expect(parseEnvFile("export A=1\nB=2")).toEqual({ A: "1", B: "2" });
  });
});

describe("the dev server's environment (LOCAL_ENV)", () => {
  test("the four R2 variables are there and blank, so a .env.local cannot switch uploads to the real bucket", () => {
    for (const name of R2) expect(LOCAL_ENV, name).toHaveProperty(name, "");
  });

  test("and the server reads blank as not set: with them uploads use the local folder (media-store)", () => {
    const env = serverEnv(LOCAL_ENV, false);
    for (const name of R2) expect(env[name as keyof typeof env], name).toBeUndefined();
  });
});
