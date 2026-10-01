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

  test("a rejected or failed send is reported as false; the log has the error name and status, not the message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() =>
      Response.json({ name: "validation_error", message: "You can only send to your own address (private@example.com).", statusCode: 422 }, { status: 422 }),
    );
    expect(await sendMail(env({ RESEND_API_KEY: "re_test" }), { to: "private@example.com", subject: "S", text: "T" })).toBe(false);
    stubFetch(() => {
      throw new Error("network down");
    });
    expect(await sendMail(env({ RESEND_API_KEY: "re_test" }), { to: "x", subject: "S", text: "T" })).toBe(false);
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("validation_error (status 422)");
    expect(logged).not.toContain("private@example.com");
  });

  test("a hung Resend call gives up after 8 s", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(console, "error").mockImplementation(() => {});
      stubFetch(() => new Promise<Response>(() => {}));
      const sent = sendMail(env({ RESEND_API_KEY: "re_test" }), { to: "x@example.com", subject: "S", text: "T" });
      await vi.advanceTimersByTimeAsync(8000);
      expect(await sent).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Telegram", () => {
  test("uses the chat id stored in KV (tg:chat) and links the admin (SITE_URL, or the given site address)", async () => {
    const f = stubFetch(() => Response.json({ ok: true }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    const r = await notifyMaria(env({ TELEGRAM_BOT_TOKEN: "123:abc" }, fakeKv({ "tg:chat": "42" })), "Teema", "Pikk tekst", { short: "Lühike" });
    expect(r).toEqual({ mail: false, telegram: true });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(f.calls[0].body).toEqual({ chat_id: "42", text: "Lühike\n\nhttps://mslab.example/admin", disable_web_page_preview: true });
    await notifyMaria(env({ TELEGRAM_BOT_TOKEN: "123:abc" }, fakeKv({ "tg:chat": "42" })), "Teema", "Tekst", { siteUrl: "https://mslab-web.dim-novare.workers.dev" });
    expect((f.calls[1].body as { text: string }).text).toBe("Teema\n\nhttps://mslab-web.dim-novare.workers.dev/admin");
  });

  test("TELEGRAM_CHAT_ID overrides KV", async () => {
    const f = stubFetch(() => Response.json({ ok: true }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    await sendTelegram(env({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "7" }, fakeKv({ "tg:chat": "42" })), "x");
    expect(f.calls[0].body).toMatchObject({ chat_id: "7" });
  });

  test("without TELEGRAM_CHAT_ID or a stored chat it is skipped: no getUpdates, nothing written to KV", async () => {
    const kv = fakeKv();
    const put = vi.spyOn(kv, "put");
    const f = stubFetch(() => Response.json({ ok: true, result: [{ message: { chat: { id: 555, type: "private" } } }] }));
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await sendTelegram(env({ TELEGRAM_BOT_TOKEN: "t" }, kv), "x")).toBe(false);
    expect(f.calls).toHaveLength(0);
    expect(put).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("[notify] no Telegram chat (TELEGRAM_CHAT_ID / KV tg:chat): Telegram skipped");
  });

  test("the Telegram request carries a timeout signal", async () => {
    const f = stubFetch(() => Response.json({ ok: true }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    await sendTelegram(env({ TELEGRAM_BOT_TOKEN: "t" }, fakeKv({ "tg:chat": "1" })), "x");
    expect(f.fn.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  test("an error answer or a network failure is false, never an exception; the log has no token or URL", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => new Response("Bad Request: chat not found", { status: 400 }));
    expect(await sendTelegram(env({ TELEGRAM_BOT_TOKEN: "123:secret" }, fakeKv({ "tg:chat": "1" })), "x")).toBe(false);
    stubFetch(() => {
      throw new TypeError("fetch failed: https://api.telegram.org/bot123:secret/sendMessage");
    });
    expect(await sendTelegram(env({ TELEGRAM_BOT_TOKEN: "123:secret" }, fakeKv({ "tg:chat": "1" })), "x")).toBe(false);
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("status 400");
    expect(logged).toContain("TypeError");
    expect(logged).not.toMatch(/secret|api\.telegram\.org|chat not found/);
  });

  test("long messages are cut to Telegram's limit", async () => {
    const f = stubFetch(() => Response.json({ ok: true }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    await sendTelegram(env({ TELEGRAM_BOT_TOKEN: "t" }, fakeKv({ "tg:chat": "1" })), "x".repeat(5000));
    expect((f.calls[0].body as { text: string }).text).toHaveLength(3900);
  });
});
