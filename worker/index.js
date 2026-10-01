/**
 * mslab-guide Worker: serves the static review site (./site via ASSETS) and
 * the comment API used by site/feedback.js.
 *
 *   POST  /api/feedback        store a comment, forward it to Telegram
 *   GET   /api/feedback/:id    one comment's location data (for "show me where")
 *   GET   /api/feedback        all comments            (header x-key: ADMIN_KEY)
 *   PATCH /api/feedback/:id    { done: true|false }    (header x-key: ADMIN_KEY)
 *
 * Storage (KV binding FEEDBACK) is the contract; Telegram is best-effort and
 * only runs when TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID secrets are set.
 */

const MAX_BYTES = 20000;
const MOODS = { good: "Meeldib", bad: "Ei meeldi", change: "Muuta" };
const DIRS = { a: "A · Pehme toimetus", b: "B · Õppeteekond", c: "C · Kunst pilgus", d: "D · Studio", a0: "A · 1. versioon", b0: "B · 1. versioon", moodboard: "Visuaalsed uuringud", hub: "Juhend (avaleht)" };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });

const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v) : undefined);

function newId() {
  const b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

function authorized(req, env) {
  const k = req.headers.get("x-key") || "";
  return !!env.ADMIN_KEY && k.length === env.ADMIN_KEY.length && k === env.ADMIN_KEY;
}

// Where "Näita kohta" should land: the hub viewer at the same direction, device and page.
function placeLink(origin, rec) {
  if (rec.dir === "hub") return `${origin}/guide/?fb=${rec.id}`;
  const hp = new URLSearchParams({ vaade: rec.dir, seade: rec.device || "desk" });
  if (rec.route) hp.set("leht", rec.route);
  return `${origin}/guide/?fb=${rec.id}#${hp}`;
}

// Chat id: TELEGRAM_CHAT_ID secret if set; otherwise the first private chat that
// wrote to the bot (e.g. /start) (read once via getUpdates, then remembered in KV).
async function chatId(env) {
  if (env.TELEGRAM_CHAT_ID) return env.TELEGRAM_CHAT_ID;
  const known = await env.FEEDBACK.get("tg:chat");
  if (known) return known;
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`);
  if (!r.ok) { console.error("telegram getUpdates", r.status, (await r.text()).slice(0, 200)); return null; }
  const d = await r.json();
  const u = (d.result || []).find((x) => x.message && x.message.chat && x.message.chat.type === "private");
  if (!u) return null;
  const id = String(u.message.chat.id);
  await env.FEEDBACK.put("tg:chat", id);
  return id;
}

async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN) return false;
  try {
    const chat = await chatId(env);
    if (!chat) return false;
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 3900), disable_web_page_preview: true }),
    });
    return r.ok;
  } catch (e) {
    console.error("telegram failed", e);
    return false;
  }
}

async function create(req, env, origin) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json({ ok: false }, 413);
  let b;
  try { b = JSON.parse(raw); } catch { return json({ ok: false }, 400); }
  if (b.website) return json({ ok: true }); // honeypot: pretend success
  const text = str(b.text, 4000);
  if (!text) return json({ ok: false, error: "text" }, 400);

  const dir = typeof b.dir === "string" && b.dir in DIRS ? b.dir : "hub";
  const el = b.el && typeof b.el === "object" ? b.el : {};
  const rec = {
    id: newId(),
    at: new Date().toISOString(),
    name: str(b.name, 60),
    dir,
    route: str(b.route, 200),
    title: str(b.title, 120),
    device: ["desk", "tab", "mob"].includes(b.device) ? b.device : undefined,
    width: num(b.width),
    mood: b.mood in MOODS ? b.mood : undefined,
    text,
    el: {
      label: str(el.label, 80),
      snippet: str(el.snippet, 200),
      sel: str(el.sel, 600),
      y: num(el.y),
      h: num(el.h),
    },
    done: false,
  };

  let stored = false;
  try {
    await env.FEEDBACK.put(`fb:${rec.at}:${rec.id}`, JSON.stringify(rec));
    await env.FEEDBACK.put(`id:${rec.id}`, `fb:${rec.at}:${rec.id}`);
    stored = true;
  } catch (e) {
    console.error("kv put failed", e);
  }

  const devLabel = { desk: "arvuti", tab: "tahvel", mob: "telefon" }[rec.device] || "";
  const msg =
    `💬 ${rec.name ? rec.name + " — kommentaar" : "Uus kommentaar"}\n` +
    `${DIRS[dir]}${rec.title ? " · " + rec.title : ""}\n` +
    (devLabel ? `Seade: ${devLabel}${rec.width ? " " + rec.width + "px" : ""}\n` : "") +
    (rec.mood ? `Hinnang: ${MOODS[rec.mood]}\n` : "") +
    (rec.el.label ? `Koht: ${rec.el.label}\n` : "") +
    (rec.el.snippet && rec.el.snippet !== rec.el.label ? `«${rec.el.snippet.slice(0, 140)}»\n` : "") +
    `\n${text}\n\n` +
    `Näita kohta: ${placeLink(origin, rec)}`;
  const telegram = await sendTelegram(env, msg);

  if (!stored && !telegram) return json({ ok: false }, 502);
  return json({ ok: true, id: rec.id, stored, telegram });
}

async function recordById(env, id) {
  const key = await env.FEEDBACK.get(`id:${id}`);
  if (!key) return null;
  const v = await env.FEEDBACK.get(key);
  return v ? { key, rec: JSON.parse(v) } : null;
}

async function list(env) {
  const out = [];
  let cursor;
  do {
    const page = await env.FEEDBACK.list({ prefix: "fb:", cursor });
    const vals = await Promise.all(page.keys.map((k) => env.FEEDBACK.get(k.name)));
    vals.forEach((v) => v && out.push(JSON.parse(v)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out.sort((x, y) => (x.at < y.at ? 1 : -1));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/api\/feedback\/?([a-z0-9]{6,20})?\/?$/);
    if (!m) return env.ASSETS.fetch(req);
    const id = m[1];
    try {
      // Links in Telegram/list always point at the public https host (local dev keeps its own).
      const origin = /^(localhost|127\.)/.test(url.hostname) ? url.origin : "https://" + url.host;
      if (req.method === "POST" && !id) return await create(req, env, origin);
      if (req.method === "GET" && id) {
        const r = await recordById(env, id);
        if (!r) return json({ ok: false }, 404);
        const { dir, route, device, text, name, el } = r.rec;
        return json({ ok: true, dir, route, device, text, name, el: { label: el.label, sel: el.sel, y: el.y, h: el.h } });
      }
      if (req.method === "GET" && !id) {
        if (!authorized(req, env)) return json({ ok: false }, 401);
        const items = await list(env);
        return json({ ok: true, items: items.map((r) => ({ ...r, link: placeLink(origin, r) })) });
      }
      if (req.method === "PATCH" && id) {
        if (!authorized(req, env)) return json({ ok: false }, 401);
        const r = await recordById(env, id);
        if (!r) return json({ ok: false }, 404);
        const b = await req.json().catch(() => ({}));
        r.rec.done = !!b.done;
        await env.FEEDBACK.put(r.key, JSON.stringify(r.rec));
        return json({ ok: true });
      }
      return json({ ok: false }, 405);
    } catch (e) {
      console.error("api error", e);
      return json({ ok: false }, 500);
    }
  },
};
