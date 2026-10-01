import { afterEach, describe, expect, test, vi } from "vitest";
import { notifyMaria, sendMail, sendTelegram, type Env } from "@/server/notify";
import { fakeKv, stubFetch } from "../fakes";

const env = (extra: Partial<Env> = {}, kv = fakeKv()): Env => ({
  KV: kv,
  MAIL_FROM: "MS LAB <info@send.diipsolutions.eu>",
  MARIA_EMAIL: "maria@example.com",
  SITE_URL: "https://mslab.example",
  ...extra,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("without secrets (local dev)", () => {
  test("nothing is sent, a console note says so, nothing throws", async () => {
    const f = stubFetch();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await notifyMaria(env(), "Teema", "Tekst")).toEqual({ mail: false, telegram: false });
    expect(f.calls).toHaveLength(0);
    expect(info).toHaveBeenCalledWith("[notify] RESEND_API_KEY is not set: e-mail skipped");
    expect(info).toHaveBeenCalledWith("[notify] TELEGRAM_BOT_TOKEN is not set: Telegram skipped");
  });
});

describe("e-mail (Resend)", () => {
  test("sends a plain-text e-mail from MAIL_FROM; reply goes to the visitor", async () => {
    const f = stubFetch(() => Response.json({ id: "email_123" }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    const ok = await sendMail(env({ RESEND_API_KEY: "re_test" }), { to: "maria@example.com", subject: "S", text: "T", replyTo: "visitor@example.com" });
    expect(ok).toBe(true);
    expect(f.calls).toHaveLength(1);
    const [call] = f.calls;
    expect(call.url).toBe("https://api.resend.com/emails");
    expect(call.method).toBe("POST");
    expect(call.headers.get("authorization")).toBe("Bearer re_test");
    expect(call.body).toMatchObject({ from: "MS LAB <info@send.diipsolutions.eu>", to: "maria@example.com", subject: "S", text: "T", reply_to: "visitor@example.com" });
  });

  test("a rejected or failed send is logged and reported as false", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => Response.json({ name: "validation_error", message: "Invalid `to` field.", statusCode: 422 }, { status: 422 }));
    expect(await sendMail(env({ RESEND_API_KEY: "re_test" }), { to: "x", subject: "S", text: "T" })).toBe(false);
    stubFetch(() => {
      throw new Error("network down");
    });
    expect(await sendMail(env({ RESEND_API_KEY: "re_test" }), { to: "x", subject: "S", text: "T" })).toBe(false);
    expect(error).toHaveBeenCalled();
  });
});

describe("Telegram", () => {
  test("uses the chat id remembered in KV (tg:chat) and links the admin", async () => {
    const f = stubFetch(() => Response.json({ ok: true }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    const r = await notifyMaria(env({ TELEGRAM_BOT_TOKEN: "123:abc" }, fakeKv({ "tg:chat": "42" })), "Teema", "Pikk tekst", { short: "Lühike" });
    expect(r).toEqual({ mail: false, telegram: true });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(f.calls[0].body).toEqual({ chat_id: "42", text: "Lühike\n\nhttps://mslab.example/admin", disable_web_page_preview: true });
  });

  test("TELEGRAM_CHAT_ID overrides KV", async () => {
    const f = stubFetch(() => Response.json({ ok: true }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    await sendTelegram(env({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "7" }, fakeKv({ "tg:chat": "42" })), "x");
    expect(f.calls[0].body).toMatchObject({ chat_id: "7" });
  });

  test("without a remembered chat: the first private chat from getUpdates, then remembered in KV", async () => {
    const kv = fakeKv();
    const f = stubFetch((url) =>
      url.endsWith("/getUpdates")
        ? Response.json({ ok: true, result: [{ message: { chat: { id: -100, type: "group" } } }, { message: { chat: { id: 555, type: "private" } } }] })
        : Response.json({ ok: true }),
    );
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await sendTelegram(env({ TELEGRAM_BOT_TOKEN: "t" }, kv), "x")).toBe(true);
    expect(f.calls.map((c) => c.url.split("/").pop())).toEqual(["getUpdates", "sendMessage"]);
    expect(f.calls[1].body).toMatchObject({ chat_id: "555" });
    expect(kv.store.get("tg:chat")).toBe("555");
  });

  test("an error answer or a network failure is false, never an exception", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => new Response("Bad Request: chat not found", { status: 400 }));
    expect(await sendTelegram(env({ TELEGRAM_BOT_TOKEN: "t" }, fakeKv({ "tg:chat": "1" })), "x")).toBe(false);
    stubFetch(() => {
      throw new Error("offline");
    });
    expect(await sendTelegram(env({ TELEGRAM_BOT_TOKEN: "t" }, fakeKv({ "tg:chat": "1" })), "x")).toBe(false);
  });

  test("long messages are cut to Telegram's limit", async () => {
    const f = stubFetch(() => Response.json({ ok: true }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    await sendTelegram(env({ TELEGRAM_BOT_TOKEN: "t" }, fakeKv({ "tg:chat": "1" })), "x".repeat(5000));
    expect((f.calls[0].body as { text: string }).text).toHaveLength(3900);
  });
});
