/* MS LAB — Studio direction prototype. Hash routes, sample data, no backend. */
(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("mslab-studio-" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("mslab-studio-" + k, JSON.stringify(v)); } catch (e) {} },
  };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const I = {
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>',
    arrow: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M9 7h8v8"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 016 0v2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  };

  // ---------- sample data (all illustrative) ----------
  const FMT = {
    e: { name: "E-õpe", short: "Veebis, omas tempos",
      q: "Mis on e-õpe?",
      def: "E-õpe tähendab eelsalvestatud videokoolitust, mida saad vaadata endale sobival ajal ja kohas. Ostuga luuakse sulle automaatselt õpilase konto, kus on videod, õppematerjalid ja test.",
      facts: ["Ligipääs 12 kuud", "Videod + PDF materjalid", "Test ja tunnistus"],
      steps: [["Vali sobiv koolitus", "Baas- või täiendkoolitus"], ["Lisa koolitus ostukorvi", "Näed kohe lõpphinda"], ["Vormista ost", "Pangalink või kaart"], ["Sulle luuakse automaatselt õpilase konto", "Kinnitus tuleb e-postiga"], ["Logi sisse ja alusta õppimist", "Kohe, omas tempos"]] },
    k: { name: "Kontaktõpe", short: "Kohapeal koolitajaga",
      q: "Mis on kontaktõpe?",
      def: "Kontaktõpe on füüsiline, kohapeal toimuv koolitus koolitaja juhendamisel. Valida saab individuaalkoolituse või väikese grupikoolituse vahel. Praktika toimub päris modellidel ja kõik töövahendid on kohapeal olemas.",
      facts: ["Individuaal- või grupikoolitus", "Praktika modellidel", "Vahendid kohapeal"],
      steps: [["Vali koolitus ja kuupäev", "Kalendrist näed linna ja vabu kohti"], ["Registreeru ja tasu", "100% või 50% ettemaks"], ["Saad juhised e-postiga", "Aeg, koht ja ettevalmistus"], ["Koolituspäev kohapeal", "Teooria ja praktika modellil"], ["Tunnistus", "Pärast edukat lõpetamist"]] },
    h: { name: "Hübriidõpe", short: "Veeb + kohapeal",
      q: "Mis on hübriidõpe?",
      def: "Hübriidõpe ühendab kaks õppevormi: e-õpe + kontaktõpe. Teooria omandad iseseisvalt veebis omas tempos ning praktiline osa toimub koolitaja juhendamisel kohapeal. Nii jõuad kontaktpäevale juba ettevalmistunult.",
      facts: ["Teooria veebis", "Praktika kohapeal", "Üks tunnistus"],
      steps: [["Vali koolitus ja kontaktpäev", "Kalendrist sobiv linn"], ["Vormista ost", "Õpilase konto luuakse automaatselt"], ["Õpi teooria veebis", "Videod ja materjalid kohe avatud"], ["Praktiline päev kohapeal", "Koolitaja juhendamisel, modellil"], ["Test, hindamine ja tunnistus", "Sinu õppeteekonna lõpp"]] },
  };

  const COURSES = [
    { id: "kulmumeister", t: "Kulmumeistri baaskoolitus", lvl: "baas", fm: ["h", "k", "e"], price: { e: 190, h: 390, k: 350 }, img: "assets/brow-editorial.jpg", pos: "40% 50%", next: "14.11", city: "Pärnu", lang: "ET / RU", badge: { l: "Populaarne", bg: "#222222", fg: "#ffffff" },
      d: "Põhjalik baaskoolitus neile, kes alustavad kulmutehnikutena: kuju, värvimine, hooldus ja klienditöö. Praktika toimub modellil." },
    { id: "lashlift", t: "Lash Lift BOTOX", lvl: "baas", fm: ["k", "h"], price: { k: 290, h: 320 }, img: "assets/lash-editorial.jpg", pos: "50% 50%", next: "21.11", city: "Tallinn", lang: "ET", badge: { l: "Uus", bg: "#DDD4DC", fg: "#222222" },
      d: "Ripsmete tõste ja toitev BOTOX-hooldus samm-sammult, koos praktikaga modellil." },
    { id: "lami", t: "Kulmude LAMI", lvl: "taiend", fm: ["k", "h"], price: { k: 220, h: 250 }, img: "assets/scis.jpg", pos: "50% 45%", next: "28.11", city: "Tartu", lang: "ET / RU", badge: null,
      d: "Kulmude laminatsioon juba töötavale meistrile: tooted, ajastus ja kuju püsivus." },
    { id: "2in1", t: "2in1 koolituspakett: kulmud + ripsmed", lvl: "baas", fm: ["h"], price: { h: 590 }, img: "assets/eye2.jpg", pos: "50% 40%", next: "05.12", city: "Pärnu", lang: "ET", badge: { l: "Bestseller", bg: "#9E8993", fg: "#ffffff" },
      d: "Kaks baaskoolitust ühes paketis — alusta kohe kahe teenusega." },
    { id: "kuju", t: "Kulmukuju ja sümmeetria", lvl: "taiend", fm: ["e"], price: { e: 95 }, img: "assets/brow2.jpg", pos: "50% 30%", next: "Kohe", city: "Veebis", lang: "ET / RU", badge: null,
      d: "Lühike täiendkoolitus kuju kaardistamise ja sümmeetria kohta." },
    { id: "henna", t: "Hennakulmude tehnika", lvl: "taiend", fm: ["e"], price: { e: 120 }, img: "assets/clip.jpg", pos: "50% 40%", next: "Kohe", city: "Veebis", lang: "ET", badge: null,
      d: "Henna valik, segamine ja kandmine — kindel tulemus eri nahatüüpidel." },
    { id: "lamiteooria", t: "Ripsmete laminatsiooni alused", lvl: "baas", fm: ["e"], price: { e: 150 }, img: "assets/eye1.jpg", pos: "50% 50%", next: "Kohe", city: "Veebis", lang: "ET / RU", badge: null,
      d: "Teooria ja tehnika videotena, enne kui lähed esimese kliendi juurde." },
    { id: "hooldus", t: "Kulmude ja ripsmete värvimine", lvl: "baas", fm: ["k"], price: { k: 180 }, img: "assets/blue.jpg", pos: "50% 40%", next: "09.12", city: "Viljandi", lang: "ET", badge: { l: "Viimased kohad", bg: "#6B4F5C", fg: "#ffffff" },
      d: "Värvimise põhitõed ühe päevaga, praktika modellil." },
  ];
  // Admin-edited badges override defaults (browser-only).
  const badgeEdits = store.get("badges", {});
  COURSES.forEach((c) => { if (c.id in badgeEdits) c.badge = badgeEdits[c.id]; });

  const SESS = [
    { d: "14.11", wd: "reede", c: "kulmumeister", city: "Pärnu", v: "MS LAB stuudio, Rüütli 12", f: "Hübriidõpe", lang: "ET", st: "few", n: 2 },
    { d: "21.11", wd: "reede", c: "lashlift", city: "Tallinn", v: "Stuudio Kalamaja", f: "Kontaktõpe", lang: "ET", st: "open", n: 4 },
    { d: "28.11", wd: "reede", c: "lami", city: "Tartu", v: "Ilusalong Emajõe", f: "Kontaktõpe", lang: "ET / RU", st: "open", n: 3 },
    { d: "05.12", wd: "reede", c: "2in1", city: "Pärnu", v: "MS LAB stuudio, Rüütli 12", f: "Hübriidõpe", lang: "ET", st: "full", n: 0 },
    { d: "09.12", wd: "teisipäev", c: "hooldus", city: "Viljandi", v: "Salong Lossi", f: "Kontaktõpe", lang: "ET", st: "few", n: 1 },
    { d: "12.12", wd: "reede", c: "kulmumeister", city: "Tallinn", v: "Stuudio Kalamaja", f: "Kontaktõpe", lang: "RU", st: "open", n: 5 },
    { d: "16.01", wd: "reede", c: "lashlift", city: "Tartu", v: "Ilusalong Emajõe", f: "Kontaktõpe", lang: "ET", st: "cancel", n: 0 },
    { d: "23.01", wd: "reede", c: "lami", city: "Pärnu", v: "MS LAB stuudio, Rüütli 12", f: "Hübriidõpe", lang: "ET / RU", st: "open", n: 4 },
  ];
  const ST = { open: ["Vabu kohti", "open"], few: ["Viimased kohad", "few"], full: ["Täis · ootenimekiri", "full"], cancel: ["Tühistatud", "cancel"] };

  const NEWS = [
    { id: 1, d: "22.09.2026", k: "Nõuanne", t: "Kuidas valida endale sobiv kulmukoolitus?", img: "assets/brow-editorial.jpg", ex: "Baas- või täiendkoolitus, e-õpe või kontaktpäev — lühike juhend, kust alustada." },
    { id: 2, d: "15.09.2026", k: "Uudis", t: "Uus koolitus: Lash Lift BOTOX", img: "assets/lash-editorial.jpg", ex: "Novembrist lisandub kalendrisse ripsmete tõste ja BOTOX-hoolduse koolitus." },
    { id: 3, d: "02.09.2026", k: "Praktika", t: "Praktika modellidega — mida oodata?", img: "assets/cert-easel.jpg", ex: "Kuidas praktikapäev käib ja miks praktikaprotokoll on sinu parim tagasiside." },
    { id: 4, d: "20.08.2026", k: "Nõuanne", t: "Kulmude hooldus pärast laminatsiooni", img: "assets/scis.jpg", ex: "Viis asja, mida kliendile pärast protseduuri alati meelde tuletada." },
    { id: 5, d: "05.08.2026", k: "Uudis", t: "MS LAB koolitused nüüd ka Tartus ja Viljandis", img: "assets/silk.jpg", ex: "Kontaktkoolitused jõuavad sügisest rohkemate linnadeni." },
    { id: 6, d: "18.07.2026", k: "Õpilase lugu", t: "Esimesest koolitusest oma salongini", img: "assets/manual.jpg", ex: "Kuidas üks baaskoolitus muutis karjääri — õpilase kogemus." },
  ];

  const REVIEWS = [
    { q: "Koolitus oli väga põhjalik ja praktika modellil andis julguse kohe tööle hakata.", n: "Kerli", c: "Kulmumeistri baaskoolitus" },
    { q: "Praktikaprotokollist oli palju abi — tean täpselt, mida edasi harjutada.", n: "Anastassia", c: "Praktika MAXI" },
    { q: "E-õpe oli selge ja hästi üles ehitatud, sain õppida õhtuti laste kõrvalt.", n: "Triin", c: "Kulmukuju ja sümmeetria" },
  ];

  const PKG_DEFAULT = {
    MINI: ["2 modelli", "Koolitaja juhendamine kogu päeva", "Kõik töövahendid ja materjalid", "Suuline tagasiside"],
    MAXI: ["4 modelli", "Koolitaja juhendamine kogu päeva", "Kõik töövahendid ja materjalid", "Kirjalik praktikaprotokoll", "Ettevalmistus tunnistuseks"],
  };
  const PKG = Object.assign({}, PKG_DEFAULT, store.get("pkg", {}));

  const SLIDES = [
    { img: "assets/hero-flower.jpg", pos: "62% 50%", posM: "78% 50%", tone: "light", k: "MS LAB Koolituskeskus", t: "Õpilase edu on meie eesmärk.", p: "Kulmu- ja ripsmekoolitused algajatele ja meistritele — veebis, kohapeal või mõlemat.", cta: ["Vali koolitus", "#/koolitused"], cta2: ["Koolituskalender", "#/kalender"] },
    { img: "assets/hero-mua.jpg", pos: "60% 40%", posM: "62% 40%", tone: "dark", k: "Hübriidõpe · 14.11 Pärnu", t: "Kulmumeistri baaskoolitus", p: "Tugev alus, läbimõeldud tehnika ja juhendatud praktika modellil.", cta: ["Tutvu koolitusega", "#/koolitus/kulmumeister"], cta2: ["Kõik kuupäevad", "#/kalender"] },
    { img: "assets/hero-hand.jpg", pos: "50% 30%", posM: "56% 22%", tone: "dark", k: "Kontaktõpe · Uus", t: "Lash Lift BOTOX", p: "Professionaalne tulemus personaalse juhendamise toel.", cta: ["Tutvu koolitusega", "#/koolitus/lashlift"], cta2: ["Registreeru", "#/kalender"] },
    { img: "assets/hero-petal.jpg", pos: "50% 50%", posM: "70% 50%", tone: "light", k: "Praktika", t: "MINI ja MAXI praktikapaketid", p: "Rohkem kindlust päris modellidega harjutades. Modellid ja vahendid leiame meie.", cta: ["Vaata pakette", "#/praktika"], cta2: ["Mis on praktikaprotokoll?", "#/praktika"] },
    { img: "assets/hero-eyebw.jpg", pos: "50% 38%", posM: "50% 30%", tone: "light", k: "E-õpe", t: "Õpi omas tempos.", p: "Selged videod ja õppematerjalid on sulle alati kättesaadavad.", cta: ["Vaata e-koolitusi", "#/koolitused?f=e"], cta2: ["Kuidas e-õpe käib?", "#/koolitused?f=e"] },
  ];

  const byId = (id) => COURSES.find((c) => c.id === id);
  const fmtNames = (c) => c.fm.map((f) => FMT[f].name);
  const minPrice = (c) => Math.min(...Object.values(c.price));
  const lvlName = (l) => (l === "baas" ? "Baaskoolitus" : "Täiendkoolitus");

  // ---------- state ----------
  let cart = store.get("cart", 0);
  let heroTimer = null;

  // ---------- chrome ----------
  const NAV = [["Koolitused", "#/koolitused"], ["Koolituskalender", "#/kalender"], ["Praktika", "#/praktika"], ["Koolitaja", "#/koolitaja"], ["Uudised", "#/uudised"]];
  function renderHeader(route) {
    const h = $("#hdr");
    h.innerHTML = `<div class="in">
      <a class="logo" href="#/" aria-label="MS LAB Koolituskeskus — avaleht"><img src="assets/logo-trim.png" alt="MS LAB Koolituskeskus" width="104" height="40"></a>
      <nav class="nav" aria-label="Peamenüü">${NAV.map(([l, u]) => `<a href="${u}"${route === u.slice(2) ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
      <div class="right">
        <div class="lang" role="group" aria-label="Keel"><button aria-pressed="true">ET</button><button aria-pressed="false" data-ru>RU</button></div>
        <a class="cart" href="#/koolitused" aria-label="Ostukorv, ${cart} toodet">${I.bag}<b>${cart}</b></a>
        <a class="btn login" href="#/oppija">Logi sisse</a>
        <button class="burger" aria-label="Ava menüü" aria-expanded="false"><span></span><span></span></button>
      </div></div>`;
    $(".burger", h).onclick = openMenu;
    $("[data-ru]", h).onclick = () => toast("Vene keel tuleb lõplikus versioonis — prototüüp on eesti keeles.");
  }
  function openMenu() {
    const m = $("#menu");
    m.innerHTML = `<div class="top"><a class="logo" href="#/"><img src="assets/logo-trim.png" alt="MS LAB" height="34" style="height:34px"></a><button class="x" aria-label="Sulge menüü">×</button></div>
      <nav aria-label="Mobiilimenüü">${NAV.map(([l, u]) => `<a href="${u}">${l}</a>`).join("")}</nav>
      <div class="foot"><a class="btn" href="#/oppija">Logi sisse</a><button class="chip" aria-pressed="true">Eesti</button><button class="chip" aria-pressed="false">Русский</button></div>`;
    m.hidden = false;
    document.body.style.overflow = "hidden";
    const close = () => { m.hidden = true; document.body.style.overflow = ""; $(".burger")?.focus(); };
    $(".x", m).onclick = close;
    $$("a", m).forEach((a) => a.addEventListener("click", close));
    m.onkeydown = (e) => { if (e.key === "Escape") close(); };
    $(".x", m).focus();
  }
  function renderFooter(show) {
    const f = $("#ftr");
    f.hidden = !show;
    if (!show) return;
    f.innerHTML = `<div class="wrap"><div class="g">
      <div><a class="logo" href="#/"><img src="assets/logo-trim.png" alt="MS LAB Koolituskeskus"></a><p class="slog">Õpilase edu on meie eesmärk!</p></div>
      <div><h4>Koolitused</h4><ul><li><a href="#/koolitused?f=e">E-õpe</a></li><li><a href="#/koolitused?f=k">Kontaktõpe</a></li><li><a href="#/koolitused?f=h">Hübriidõpe</a></li><li><a href="#/praktika">Praktika</a></li></ul></div>
      <div><h4>MS LAB</h4><ul><li><a href="#/koolitaja">Koolitaja</a></li><li><a href="#/uudised">Uudised</a></li><li><a href="#/kalender">Koolituskalender</a></li><li><a href="#/oppija">Õppija konto</a></li></ul></div>
      <div><h4>Kontakt</h4><ul><li><a href="mailto:info@mslab.ee">info@mslab.ee</a></li><li><span>Pärnu · Tallinn · Tartu</span></li><li><a href="#/admin">Admin (demo)</a></li></ul></div>
    </div><div class="bot"><span>© 2026 MS LAB Koolituskeskus · Registrikood ——</span><span>Privaatsus · Tingimused</span></div></div>`;
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("on"), 2600);
  }

  // ---------- components ----------
  const badgeHtml = (b) => (b && b.l ? `<span class="badge" style="background:${esc(b.bg)};color:${esc(b.fg)}">${esc(b.l)}</span>` : "");
  function card(c, ratio) {
    const f = fmtNames(c);
    return `<a class="card" href="#/koolitus/${c.id}">
      <div class="img"${ratio ? ` style="aspect-ratio:${ratio}"` : ""}><img src="${c.img}" alt="" loading="lazy" style="object-position:${c.pos}">${badgeHtml(c.badge)}<span class="go" aria-hidden="true">${I.arrow}</span></div>
      <div class="tags"><span class="tag">${f.join(" · ")}</span><span class="tag">${lvlName(c.lvl)}</span><span class="tag o">${c.lang}</span></div>
      <h3>${esc(c.t)}</h3>
      <div class="meta"><span>${c.next === "Kohe" ? "Alusta kohe · veebis" : `${c.next} · <span class="city">${c.city}</span>`}</span><b>alates €${minPrice(c)}</b></div>
    </a>`;
  }
  function steps(fk) {
    return `<ol class="steps" aria-label="${FMT[fk].name}: sinu õppeteekond">${FMT[fk].steps.map((s, i) => `<li><span class="n">0${i + 1}</span><div><b>${s[0]}</b><span>${s[1]}</span></div></li>`).join("")}</ol>`;
  }
  function carousel(id, items) {
    return `<div class="car" id="${id}"><div class="track" tabindex="0" aria-label="Karussell">${items}</div></div>`;
  }
  function carCtl(id) {
    return `<div class="car-ctl" data-for="${id}"><button aria-label="Eelmised">${I.chevL}</button><button aria-label="Järgmised">${I.chevR}</button></div>`;
  }
  function wireCarousels() {
    $$(".car-ctl").forEach((ctl) => {
      const tr = $(`#${ctl.dataset.for} .track`);
      if (!tr) return;
      const [p, n] = $$("button", ctl);
      const step = () => (tr.firstElementChild ? tr.firstElementChild.getBoundingClientRect().width + 18 : 300);
      p.onclick = () => tr.scrollBy({ left: -step(), behavior: reduced ? "auto" : "smooth" });
      n.onclick = () => tr.scrollBy({ left: step(), behavior: reduced ? "auto" : "smooth" });
      const upd = () => { p.disabled = tr.scrollLeft < 4; n.disabled = tr.scrollLeft + tr.clientWidth > tr.scrollWidth - 4; };
      tr.addEventListener("scroll", upd, { passive: true });
      upd();
    });
  }
  const newsDark = (a) => `<a class="news dk" href="#/uudis/${a.id}"><div class="ph"><img src="${a.img}" alt="" loading="lazy"></div><div class="bd"><span class="dt">${a.d} · ${a.k}</span><h3>${esc(a.t)}</h3><span class="ex">${esc(a.ex)}</span></div></a>`;
  const FAQ = [
    ["Kas vajan eelnevaid kogemusi?", "Ei. Baaskoolitused on mõeldud alustajatele ja on mahukamad. Täiendkoolitused sobivad neile, kes juba töötavad ja soovivad õppida konkreetset tehnikat."],
    ["Mis juhtub pärast e-koolituse ostu?", "Sulle luuakse automaatselt õpilase konto ja saad kinnituse e-postiga. Logi sisse ja alusta kohe — videod ja materjalid on avatud kogu ligipääsu aja."],
    ["Mis vahe on kontakt- ja hübriidõppel?", "Kontaktõpe toimub täielikult kohapeal. Hübriidõppe puhul õpid teooria veebis omas tempos ja kohapeal toimub ainult praktiline osa."],
    ["Kas modellid tuleb ise leida?", "Ei. Praktikaks leiab modellid koolituskeskus ning kõik töövahendid on kohapeal olemas."],
    ["Kas saan maksta osade kaupa?", "Kontakt- ja hübriidkoolitusi saab tasuda ka 50% ettemaksuga. E-õppe moodulid avanevad kohe pärast ettemaksu."],
    ["Millal saan tunnistuse?", "Pärast koolituse lõpetamist: e-õppes pärast testi, kontakt- ja hübriidõppes pärast praktilise töö hindamist."],
  ];
  const newsCard = (a) => `<a class="news" href="#/uudis/${a.id}"><div class="ph"><img src="${a.img}" alt="" loading="lazy"></div><div class="bd"><span class="dt">${a.d} · ${a.k}</span><h3>${esc(a.t)}</h3><span class="muted" style="font-size:15px">${esc(a.ex)}</span><span class="more">Loe edasi</span></div></a>`;

  // ---------- pages ----------
  function pHome() {
    const up = SESS.filter((s) => s.st !== "cancel").slice(0, 3);
    return `
    <section class="hero" id="hero" aria-roledescription="karussell" aria-label="Esilehe bännerid">
      ${SLIDES.map((s, i) => `<div class="slide${i === 0 ? " on" : ""}" data-tone="${s.tone}" data-pos="${s.pos}" data-posm="${s.posM}" aria-roledescription="slaid" aria-label="${i + 1} / ${SLIDES.length}"${i ? ' aria-hidden="true"' : ""}>
        <img src="${s.img}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'} style="object-position:${s.pos}">
        <div class="txt"><div class="wrap"><div class="box">
          <p class="kick">${s.k}</p>
          ${i === 0 ? "<h1>" : "<h2>"}${s.t}${i === 0 ? "</h1>" : "</h2>"}
          <p>${s.p}</p>
          <div class="ctas"><a class="btn" href="${s.cta[1]}" tabindex="${i ? -1 : 0}">${s.cta[0]}</a><a class="more" href="${s.cta2[1]}" tabindex="${i ? -1 : 0}">${s.cta2[0]}</a></div>
        </div></div></div></div>`).join("")}
      <div class="hctl"><div class="wrap">
        <div class="pill"><div class="dots">${SLIDES.map((_, i) => `<button aria-label="Slaid ${i + 1}"${i === 0 ? ' aria-current="true"' : ""}><i></i></button>`).join("")}</div><button class="pp" aria-label="Peata">${I.pause}</button></div>
        <span class="count">01 / 0${SLIDES.length}</span>
        <div class="arrs"><button class="arr" aria-label="Eelmine slaid">${I.chevL}</button><button class="arr" aria-label="Järgmine slaid">${I.chevR}</button></div>
      </div></div>
    </section>

    <section class="upc" aria-label="Tulevased koolitused"><div class="wrap">
      ${up.map((s) => { const c = byId(s.c); return `<a href="#/koolitus/${c.id}"><span class="d">${s.d}<small>${s.wd}</small></span><span class="t">${esc(c.t)}</span><span class="m"><b>${s.city}</b> · ${s.f} · ${s.lang}</span></a>`; }).join("")}
    </div></section>

    <section class="sec stmt"><div class="wrap"><p class="eyebrow center">MS LAB Koolituskeskus</p>
      <p class="statement">Õpetame kulmu- ja ripsmetehnikaid nii, <span>nagu oleksime ise tahtnud õppida — väikestes gruppides, päris modellidel ja toega ka pärast koolitust.</span></p></div></section>

    <section class="sec" style="padding-top:0"><div class="wrap">
      <div class="row-head"><div><p class="eyebrow">Koolitused</p><h2 class="h2">Vali oma koolitus.</h2></div><a class="more" href="#/koolitused">Kõik koolitused</a></div>
      <div class="grid four">${COURSES.slice(0, 4).map((c) => card(c)).join("")}</div>
    </div></section>

    <section class="sec fmt" id="formats"><div class="wrap">
      <div class="head"><div><p class="eyebrow">Sinu õppeteekond</p><h2 class="h2">Kuidas soovid õppida?</h2><p class="lead">Enne ostu näed täpselt, kuidas õppimine käib ja mis sind lõpuks ees ootab.</p></div>
        <div class="seg" role="tablist" aria-label="Õppevorm">${Object.keys(FMT).map((k, i) => `<button role="tab" aria-selected="${i === 0}" data-fk="${k}">${FMT[k].name}</button>`).join("")}</div></div>
      <div class="panel" id="fmtPanel" role="tabpanel">${fmtPanel("e")}</div>
    </div></section>

    <section class="sec"><div class="wrap">
      <div class="trainer">
        <div class="ph"><img src="assets/maria-standing.jpg" alt="Koolitaja Maria Sosnina" loading="lazy"></div>
        <div class="tx"><p class="eyebrow">Sinu koolitaja</p><h2 class="h2">Maria Sosnina</h2>
          <p class="lead">Kulmu- ja ripsmetehnikate meister ja koolitaja. Õpetan nii, nagu oleksin ise tahtnud õppida: selgelt, praktiliselt ja iga õpilase tempos.</p>
          <div class="stats"><div><b>8+</b><span>aastat kogemust</span></div><div><b>4</b><span>linna</span></div><div><b>1:4</b><span>väikesed grupid</span></div></div>
          <div><a class="btn ghost" href="#/koolitaja">Loe koolitajast</a></div></div>
      </div>
    </div></section>

    <section class="sec tight"><div class="wrap">
      <div class="row-head"><div><p class="eyebrow">Tule. Õpi. Loo. Kasva.</p><h2 class="h2">Sinu koolitusega kaasa.</h2></div></div>
      <div class="kit">
        <figure><div class="ph"><img src="assets/manual.jpg" alt="MS LAB õppematerjal" loading="lazy" style="object-position:50% 80%"></div><figcaption><b>Professionaalne õppematerjal</b><span>Kvaliteetne, struktureeritud ja tulemuslik.</span></figcaption></figure>
        <figure><div class="ph"><img src="assets/cert-black.jpg" alt="MS LAB tunnistus raamis" loading="lazy" style="object-position:50% 50%"></div><figcaption><b>Tunnistus</b><span>Pärast koolituse edukat lõpetamist.</span></figcaption></figure>
        <figure><div class="ph"><img src="assets/gift.jpg" alt="MS LAB kingikott ja seerum" loading="lazy" style="object-position:50% 62%"></div><figcaption><b>Kingitus koolitusel</b><span>MAXEYELASH seerum igale õpilasele.</span></figcaption></figure>
      </div>
    </div></section>

    <section class="sec tight"><div class="wrap">
      <div class="tile orchid"><div class="prac-teaser">
        <div><p class="eyebrow">Praktika</p><h2 class="h2">Harjuta päris modellidel.</h2>
          <p class="lead">Modellid ja kõik töövahendid leiab koolituskeskus. Koolitaja on kogu aeg sinu kõrval ja täidab praktikaprotokolli.</p>
          <div style="margin-top:28px"><a class="btn" href="#/praktika">Vaata pakette</a></div></div>
        <div class="pk">
          <a class="p" href="#/praktika" style="text-decoration:none"><b>MINI</b><span>${esc(PKG.MINI[0])}</span><div class="pr">€100</div></a>
          <a class="p" href="#/praktika" style="text-decoration:none"><b>MAXI</b><span>${esc(PKG.MAXI[0])} · protokoll</span><div class="pr">€150</div></a>
        </div>
      </div></div>
    </div></section>

    <section class="sec"><div class="wrap"><div class="blogp">
      <div class="bh"><div><p class="eyebrow">Blogi</p><h2 class="h2">Uudised ja nõuanded</h2></div><p>Nõuanded, uued koolitused ja õpilaste lood. Iga kaart viib täismahus postitusele.</p></div>
      <div class="bl"></div>
      ${carousel("newsCar", NEWS.map(newsDark).join(""))}
      <div class="bf"><a class="more" href="#/uudised">Kõik postitused</a>${carCtl("newsCar")}</div>
    </div></div></section>

    <section class="sec tight" style="padding-bottom:0"><div class="wrap">
      <div class="row-head"><div><p class="eyebrow">Õpilaste kogemused</p><h2 class="h2">Mida öeldakse.</h2></div>${carCtl("revCar")}</div>
    </div>${carousel("revCar", REVIEWS.map((r) => `<figure class="rev" style="margin:0"><q>${esc(r.q)}</q><figcaption class="who"><b>${r.n}</b> · ${r.c}</figcaption></figure>`).join(""))}
    <div class="wrap"><p class="muted" style="font-size:13px;margin-top:14px">Näidisarvustused. Arvustused avaldatakse pärast kontrolli.</p></div></section>

    <section class="sec"><div class="wrap faq">
      <div><p class="eyebrow">KKK</p><h2 class="h2">Korduma kippuvad küsimused</h2></div>
      <div class="qs">${FAQ.map((q, i) => `<details${i === 0 ? " open" : ""}><summary>${q[0]}</summary><p>${q[1]}</p></details>`).join("")}</div>
    </div></section>

    <section class="sec tight" style="padding-top:0"><div class="wrap"><div class="contact">
      <div><p class="eyebrow">Kontakt</p><h2 class="h2">Ei tea, milline koolitus sobib?</h2><p class="lead">Kirjuta Mariale — soovitan sulle sobiva koolituse ja õppevormi.</p>
        <div class="who"><img src="assets/maria-seated.jpg" alt=""><span><b>Maria Sosnina</b><br>vastab tavaliselt ühe tööpäeva jooksul</span></div></div>
      <form id="cForm" class="cf"><label>Nimi<input required autocomplete="name"></label><label>E-post<input type="email" required autocomplete="email"></label><label>Sõnum<textarea required placeholder="Nt. olen algaja ja huvitun kulmudest…"></textarea></label><button class="btn">Saada</button></form>
    </div></div></section>

    <section class="sec" style="padding-top:0"><div class="wrap"><div class="nl">
      <img class="bg" src="assets/fl2.jpg" alt="" loading="lazy">
      <p class="eyebrow">Uudiskiri</p><h2 class="h2">Uudised, nõuanded ja −10% esimesest ostust.</h2>
      <form id="nlForm"><label class="sr" for="nlMail" style="position:absolute;left:-999px">E-posti aadress</label><input id="nlMail" type="email" required placeholder="E-posti aadress" autocomplete="email"><button class="btn">Liitu</button></form>
      <label class="c"><input type="checkbox" required form="nlForm"> Soovin saada MS LAB uudiskirja. Saan igal ajal loobuda.</label>
      <div id="nlOk"></div>
    </div></div></section>`;
  }
  function fmtPanel(k) {
    const f = FMT[k];
    return `<div class="def"><div><h3 class="h3">${f.q}</h3><div class="facts">${f.facts.map((x) => `<span class="tag">${x}</span>`).join("")}</div></div><div><p>${f.def}</p><p style="margin-top:14px"><a class="more" href="#/koolitused?f=${k}">Vaata ${f.name.toLowerCase()} koolitusi</a></p></div></div>${steps(k)}`;
  }
  function initHome() {
    const hero = $("#hero");
    const slides = $$(".slide", hero);
    const dots = $$(".dots button", hero);
    const hdr = $("#hdr");
    let i = 0, playing = !reduced;
    const DUR = 6500;
    hero.style.setProperty("--dur", DUR + "ms");
    const mq = window.matchMedia("(max-width:760px)");
    const setPos = () => slides.forEach((s) => ($("img", s).style.objectPosition = mq.matches ? s.dataset.posm : s.dataset.pos));
    setPos();
    mq.addEventListener("change", setPos);
    function go(n) {
      slides[i].classList.remove("on");
      slides[i].setAttribute("aria-hidden", "true");
      $$("a", slides[i]).forEach((a) => (a.tabIndex = -1));
      dots[i].removeAttribute("aria-current");
      i = (n + slides.length) % slides.length;
      slides[i].classList.add("on");
      slides[i].removeAttribute("aria-hidden");
      $$("a", slides[i]).forEach((a) => (a.tabIndex = 0));
      const di = dots[i].querySelector("i");
      dots[i].setAttribute("aria-current", "true");
      di.style.animation = "none"; void di.offsetWidth; di.style.animation = "";
      const tone = slides[i].dataset.tone;
      hero.dataset.tone = tone;
      hdr.dataset.tone = tone;
      $(".count", hero).textContent = `0${i + 1} / 0${slides.length}`;
      schedule();
    }
    function schedule() { clearTimeout(heroTimer); if (playing) heroTimer = setTimeout(() => go(i + 1), DUR); }
    dots.forEach((d, n) => (d.onclick = () => go(n)));
    const [prev, next] = $$(".arr", hero);
    prev.onclick = () => go(i - 1);
    next.onclick = () => go(i + 1);
    const pp = $(".pp", hero);
    const setPP = () => { pp.innerHTML = playing ? I.pause : I.play; pp.setAttribute("aria-label", playing ? "Peata" : "Esita"); hero.classList.toggle("paused", !playing); };
    pp.onclick = () => { playing = !playing; setPP(); schedule(); };
    setPP();
    // swipe
    let x0 = null;
    hero.addEventListener("touchstart", (e) => (x0 = e.touches[0].clientX), { passive: true });
    hero.addEventListener("touchend", (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); x0 = null; });
    hero.dataset.tone = slides[0].dataset.tone;
    hdr.dataset.tone = slides[0].dataset.tone;
    schedule();
    // formats tabs
    $$("#formats .seg button").forEach((b) => (b.onclick = () => {
      $$("#formats .seg button").forEach((x) => x.setAttribute("aria-selected", x === b));
      $("#fmtPanel").innerHTML = fmtPanel(b.dataset.fk);
    }));
    $("#cForm").onsubmit = (e) => { e.preventDefault(); e.target.outerHTML = `<div class="ok-box" style="background:#fff;color:#222"><i>✓</i><div><b>Sõnum on saadetud.</b><br><span class="muted">Maria vastab peagi (näidis).</span></div></div>`; };
    // newsletter
    $("#nlForm").onsubmit = (e) => {
      e.preventDefault();
      const cb = $(".nl label.c input");
      if (!cb.checked) { toast("Palun kinnita nõusolek."); return; }
      $("#nlOk").innerHTML = `<div class="ok-box" style="max-width:520px;margin:22px auto 0;background:#fff;text-align:left"><i>✓</i><div><b>Kontrolli oma postkasti.</b><br><span class="muted">Pärast kinnitamist saadame tervituskoodi −10% (näidis).</span></div></div>`;
      e.target.reset();
    };
  }

  function pCatalog(q) {
    const f = q.get("f") || "all", l = q.get("l") || "all";
    return `<section class="phead"><div class="wrap">
      <p class="eyebrow">Koolitused</p><h1 class="h1">Leia oma koolitus.</h1>
      <p class="lead">Vali õppevorm ja tase. Iga õppevormi juures näed, kuidas õppimine samm-sammult käib.</p>
      <div class="filters">
        <div class="frow"><div class="search">${I.search}<input id="q" type="search" placeholder="Otsi koolitust" aria-label="Otsi koolitust" autocomplete="off"></div></div>
        <div class="frow"><span class="lab">Vorm</span><div class="chips" id="fF">${[["all", "Kõik"], ["e", "E-õpe"], ["k", "Kontaktõpe"], ["h", "Hübriidõpe"]].map(([k, n]) => `<button class="chip" data-v="${k}" aria-pressed="${f === k}">${n}</button>`).join("")}</div></div>
        <div class="frow"><span class="lab">Tase</span><div class="chips" id="fL">${[["all", "Kõik tasemed"], ["baas", "Baaskoolitused"], ["taiend", "Täiendkoolitused"]].map(([k, n]) => `<button class="chip" data-v="${k}" aria-pressed="${l === k}">${n}</button>`).join("")}</div></div>
      </div>
      <div class="explain" id="explain"></div>
      <div class="grid four" id="cgrid"></div>
    </div></section><div style="height:clamp(56px,8vw,112px)"></div>`;
  }
  function initCatalog(q) {
    let f = q.get("f") || "all", l = q.get("l") || "all", s = "";
    const draw = () => {
      $("#explain").innerHTML = f === "all"
        ? `<p class="eyebrow">Õppevormid</p><div class="fmt3">${Object.keys(FMT).map((k) => `<button data-k="${k}"><b>${FMT[k].name}</b><span>${FMT[k].def.split(". ")[0]}.</span><em>Kuidas see käib ›</em></button>`).join("")}</div>`
        : `<p class="eyebrow">Sinu õppeteekond</p><h2 class="h3" style="font-size:clamp(26px,2.6vw,36px)">${FMT[f].q}</h2><p class="lead" style="max-width:760px">${FMT[f].def}</p>${steps(f)}`;
      $$("#explain .fmt3 button").forEach((b) => (b.onclick = () => { f = b.dataset.k; sync(); }));
      const list = COURSES.filter((c) => (f === "all" || c.fm.includes(f)) && (l === "all" || c.lvl === l) && (!s || c.t.toLowerCase().includes(s)));
      $("#cgrid").innerHTML = list.length ? list.map((c) => card(c, "1/1")).join("") : `<div class="empty" style="grid-column:1/-1">Selle filtriga koolitusi hetkel pole. <button class="chip" id="reset" style="margin-left:8px">Näita kõiki</button></div>`;
      const r = $("#reset"); if (r) r.onclick = () => { f = "all"; l = "all"; s = ""; $("#q").value = ""; sync(); };
    };
    const sync = () => {
      $$("#fF .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === f));
      $$("#fL .chip").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === l));
      const u = new URLSearchParams(); if (f !== "all") u.set("f", f); if (l !== "all") u.set("l", l);
      history.replaceState(null, "", "#/koolitused" + (u.toString() ? "?" + u : ""));
      draw();
    };
    $$("#fF .chip").forEach((b) => (b.onclick = () => { f = b.dataset.v; sync(); }));
    $$("#fL .chip").forEach((b) => (b.onclick = () => { l = b.dataset.v; sync(); }));
    $("#q").oninput = (e) => { s = e.target.value.trim().toLowerCase(); draw(); };
    draw();
  }

  function pCourse(id) {
    const c = byId(id) || COURSES[0];
    const offers = c.fm.map((k) => [k, FMT[k].name, c.price[k], k === "e" ? "Videod ja materjalid kohe, ligipääs 12 kuud" : k === "h" ? "Teooria veebis + praktiline päev kohapeal" : "Kohapeal koolitajaga, praktika modellil"]);
    const dates = SESS.filter((s) => s.c === c.id);
    return `<section class="phead" style="padding-bottom:0"><div class="wrap">
      <div class="crumb"><a href="#/koolitused">Koolitused</a> › ${esc(c.t)}</div>
      <div class="cd">
        <div class="gal"><div class="main"><img src="${c.img}" alt="" style="object-position:${c.pos}"></div><div class="th"><img src="assets/manual.jpg" alt="" style="object-position:50% 80%"></div><div class="th"><img src="assets/cert-white.jpg" alt=""></div><div class="th"><img src="assets/gift.jpg" alt="" style="object-position:50% 62%"></div></div>
        <div>
          <div class="tags" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">${badgeHtml(c.badge)}<span class="tag">${lvlName(c.lvl)}</span><span class="tag o">${c.lang}</span></div>
          <h1 class="h1" style="font-size:clamp(36px,4.4vw,60px)">${esc(c.t)}</h1>
          <p class="lead">${esc(c.d)}</p>
          <p class="eyebrow" style="margin-top:36px">Vali õppevorm</p>
          <div class="opt" id="opt">${offers.map(([k, n, p, d], i) => `<label><input type="radio" name="o" value="${k}"${i === 0 ? " checked" : ""}><span class="nm">${n}</span><span class="pr">€${p}</span><span class="ds">${d}</span></label>`).join("")}</div>
          <div id="dateWrap"><p class="eyebrow">Vali kuupäev ja linn</p><div class="dates">${dates.length ? dates.map((s, i) => `<button class="chip" aria-pressed="${i === 0 && s.st !== "full" && s.st !== "cancel"}"${s.st === "full" || s.st === "cancel" ? " disabled" : ""}>${s.d} · ${s.city}</button>`).join("") : '<span class="muted">Uued kuupäevad avaldatakse peagi.</span>'}</div></div>
          <div class="infos"><div><b>Veebiligipääs</b>12 kuud</div><div><b>Maksmine</b>100% või 50% ettemaks</div><div><b>Lõpetamine</b>Test + tunnistus</div></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="add">Lisa ostukorvi · <span id="pr">€${offers[0][2]}</span></button><a class="btn ghost" href="#/kalender">Koolituskalender</a></div>
          <p class="muted" style="font-size:13px;margin-top:14px">Hinnad ja kuupäevad on näidisandmed.</p>
        </div>
      </div></div></section>
      <section class="sec"><div class="wrap" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:56px">
        <div><p class="eyebrow">Õpiväljundid</p><h2 class="h2" style="font-size:clamp(28px,3vw,40px);margin-bottom:28px">Pärast koolitust oskad</h2>
          <ul class="outc"><li>Kaardistada kulmukuju vastavalt näo proportsioonidele</li><li>Valida ja segada värvi eri nahatüüpidele</li><li>Teha protseduuri algusest lõpuni kindla käega</li><li>Nõustada klienti hoolduse ja järelhoolduse osas</li></ul></div>
        <div><p class="eyebrow">Programm</p><h2 class="h2" style="font-size:clamp(28px,3vw,40px);margin-bottom:28px">Samm-sammult</h2>
          <ol class="prog">${[["Sissejuhatus ja hügieen", "Veeb · 40 min"], ["Kulmude arhitektuur", "Veeb · 1 h 20 min"], ["Värvid ja segamine", "Veeb · 55 min"], ["Praktika modellil", "Kohapeal · 4 h"], ["Test ja tunnistus", "Veeb · 20 min"]].map((r, i) => `<li><span class="n">0${i + 1}</span><b>${r[0]}</b><span class="mt">${r[1]}</span></li>`).join("")}</ol></div>
      </div></section>
      <div class="sticky-buy"><div><span id="sbN">${offers[0][1]}</span><b id="sbP">€${offers[0][2]}</b></div><button class="btn sm" id="add2">Lisa ostukorvi</button></div>`;
  }
  function initCourse() {
    document.body.classList.add("has-buy");
    const upd = () => {
      const r = $("#opt input:checked");
      const lab = r.closest("label");
      const p = $(".pr", lab).textContent;
      $("#pr").textContent = p; $("#sbP").textContent = p; $("#sbN").textContent = $(".nm", lab).textContent;
      $("#dateWrap").hidden = r.value === "e";
    };
    $$("#opt input").forEach((r) => (r.onchange = upd));
    $$(".dates .chip:not([disabled])").forEach((b) => (b.onclick = () => { $$(".dates .chip").forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
    const add = () => { cart++; store.set("cart", cart); $(".cart b").textContent = cart; toast("Lisatud ostukorvi (näidis)."); };
    $("#add").onclick = add; $("#add2").onclick = add;
    upd();
  }

  function pCalendar(q) {
    const city = q.get("c") || "all";
    return `<section class="phead"><div class="wrap">
      <p class="eyebrow">Koolituskalender</p><h1 class="h1">Kus ja millal.</h1>
      <p class="lead">Iga koolituse juures on kohe näha linn, õppevorm, keel ja vabade kohtade arv.</p>
      <div class="chips cities" id="cityF">${["all", "Pärnu", "Tallinn", "Tartu", "Viljandi"].map((c) => `<button class="chip" data-v="${c}" aria-pressed="${city === c}">${c === "all" ? "Kõik linnad" : c}</button>`).join("")}</div>
      <div class="cal" id="cal"></div>
      <p class="muted" style="font-size:13px;margin-top:18px">Kuupäevad ja kohtade arv on näidisandmed.</p>
    </div></section><div style="height:clamp(40px,6vw,80px)"></div>`;
  }
  function initCalendar(q) {
    let city = q.get("c") || "all";
    const draw = () => {
      const list = SESS.filter((s) => city === "all" || s.city === city);
      $("#cal").innerHTML = list.length ? list.map((s) => {
        const c = byId(s.c), st = ST[s.st];
        const act = s.st === "full" ? `<button class="btn sm ghost">Ootenimekirja</button>` : s.st === "cancel" ? `<a class="btn sm ghost" href="#/koolitused">Vaata teisi</a>` : `<a class="btn sm" href="#/koolitus/${c.id}">Registreeru</a>`;
        return `<article class="ses ${st[1]}"><div class="d">${s.d}<small>${s.wd}</small></div>
          <div class="city"><small>Linn</small><b>${I.pin}${s.city}</b></div>
          <div class="c"><b>${esc(c.t)}</b><span>${s.v}</span></div>
          <div class="f">${s.f} · ${s.lang}</div>
          <div class="stc"><span class="st ${st[1]}">${st[0]}${s.n ? ` · ${s.n} ${s.n === 1 ? "koht" : "kohta"}` : ""}</span></div>
          <div class="act">${act}</div></article>`;
      }).join("") : `<div class="empty">Selles linnas hetkel koolitusi pole.</div>`;
    };
    $$("#cityF .chip").forEach((b) => (b.onclick = () => { city = b.dataset.v; $$("#cityF .chip").forEach((x) => x.setAttribute("aria-pressed", x === b)); draw(); }));
    draw();
  }

  function pPractice() {
    return `<section class="phead"><div class="wrap intro2">
      <div><p class="eyebrow">Praktika</p><h1 class="h1">Kindlus tuleb harjutades.</h1>
        <p class="lead">Praktikapäev on mõeldud kõigile, kes on koolituse läbinud ja soovivad enne iseseisvat tööd rohkem kogemust — päris modellidel, koolitaja kõrval.</p>
        <div style="display:flex;gap:10px;margin-top:30px;flex-wrap:wrap"><a class="btn" href="#pk">Vali pakett</a><a class="btn ghost" href="#pk">Praktikaprotokoll</a></div></div>
      <div class="ph"><img src="assets/maria-seated.jpg" alt="Koolitaja Maria Sosnina" style="object-position:50% 30%"></div>
    </div></section>
    <section class="sec tight" id="pk"><div class="wrap"><div class="darkp">
      <div><p class="eyebrow">Praktikapaketid</p><h2 class="h2">Vali praktikapakett.</h2>
        <p style="margin-top:22px">Praktika toimub koolitaja juhendamisel. Õpilasele leiab koolituskeskus vajalikud modellid ning tagab kõik tööks vajalikud vahendid. Koolitaja jälgib kogu tööprotsessi, annab jooksvalt juhiseid, näpunäiteid ja tagasisidet.</p></div>
      <div class="proto"><p class="eyebrow">Praktikaprotokoll</p>
        <p style="margin:0">Kogu praktika vältel täidab koolitaja praktikaprotokolli, mis annab kokkuvõtte kogu praktikapäevast. Pärast praktikat saad protokolli endale — see on sinu personaalne tagasiside.</p>
        <div class="chips"><span>Mis õnnestus hästi</span><span>Millele pöörata tähelepanu</span><span>Mida veel arendada</span></div>
        <div class="sheet" aria-label="Protokolli näidis"><div class="r"><span>Modell 2 · kulmukuju</span><b>Väga hea</b></div><div class="r"><span>Värvi toon</span><b>Jälgi aega</b></div><div class="r"><span>Järgmine samm</span><b>Sümmeetria harjutus</b></div></div>
      </div>
      <div class="pkgs">${["MINI", "MAXI"].map((k) => `<article class="pkg ${k.toLowerCase()}" data-k="${k}"><div class="top"><div><div class="nm">${k}</div><div class="sub">${k === "MINI" ? "Kiire kindlustunne" : "Põhjalik praktikapäev"}</div></div>${k === "MAXI" ? '<span class="badge" style="background:#222;color:#fff">Soovitame</span>' : ""}</div>
        <ul>${PKG[k].map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <div class="pr">€${k === "MINI" ? 100 : 150}<small>näidishind</small></div><button class="btn${k === "MINI" ? " ghost" : ""}" data-reg="${k}">Registreeru</button></article>`).join("")}</div></div>
      <div id="regForm"></div>
    </div></section><div style="height:clamp(40px,6vw,80px)"></div>`;
  }
  function initPractice() {
    $$("[data-reg]").forEach((b) => (b.onclick = () => {
      const k = b.dataset.reg;
      $$(".pkg").forEach((p) => p.classList.toggle("sel", p.dataset.k === k));
      $("#regForm").innerHTML = `<form class="form" id="pf" style="margin-top:28px"><p class="eyebrow full" style="margin:0">Praktikataotlus · ${k}</p>
        <label>Nimi<input required autocomplete="name"></label><label>E-post<input type="email" required autocomplete="email"></label>
        <label>Läbitud koolitus<select><option>Kulmumeistri baaskoolitus</option><option>Lash Lift BOTOX</option><option>Kulmude LAMI</option><option>Muu</option></select></label>
        <label>Eelistatud linn<select><option>Pärnu</option><option>Tallinn</option><option>Tartu</option><option>Viljandi</option></select></label>
        <label class="full">Sobivad ajad<textarea placeholder="Nt. novembri reeded või nädalavahetused"></textarea></label>
        <div class="full"><button class="btn">Saada taotlus</button><p class="muted" style="font-size:13px;margin:10px 0 0">Koolitaja kinnitab aja e-postiga. Selles sammus midagi ei broneerita ega maksta.</p></div></form>`;
      $("#pf").onsubmit = (e) => { e.preventDefault(); $("#regForm").innerHTML = `<div class="ok-box"><i>✓</i><div><b>Taotlus on saadetud.</b><br><span class="muted">Maria võtab sinuga ühendust ja pakub sobiva aja (näidis).</span></div></div>`; };
      $("#regForm").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }));
  }

  function pTrainer() {
    return `<section class="phead"><div class="wrap intro2">
      <div><p class="eyebrow">Koolitaja</p><h1 class="h1">Maria Sosnina</h1>
        <p class="lead">Kulmu- ja ripsmetehnikate meister ja koolitaja. Töötan Pärnus ilukliinikus ja koolitan üle Eesti.</p>
        <p class="lead">Minu eesmärk on lihtne: et iga õpilane lahkuks koolituselt oskuste ja kindlusega alustada. Seepärast on grupid väikesed, praktika päris modellidel ja tagasiside kirjalik.</p>
        <div class="stats" style="max-width:460px"><div><b>8+</b><span>aastat kogemust</span></div><div><b>300+</b><span>õpilast (näidis)</span></div><div><b>4</b><span>linna</span></div></div>
        <a class="btn" href="#/koolitused">Vaata koolitusi</a></div>
      <div class="ph"><img src="assets/maria-standing.jpg" alt="Maria Sosnina" style="object-position:50% 20%"></div>
    </div></section><div style="height:clamp(40px,6vw,80px)"></div>`;
  }

  function pNewsList() {
    return `<section class="phead"><div class="wrap"><p class="eyebrow">Uudised ja nõuanded</p><h1 class="h1">Blogi.</h1>
      <div class="grid" style="margin-top:44px">${NEWS.map(newsCard).join("")}</div></div></section><div style="height:clamp(40px,6vw,80px)"></div>`;
  }
  function pArticle(id) {
    const a = NEWS.find((n) => n.id === +id) || NEWS[0];
    const others = NEWS.filter((n) => n !== a).slice(0, 3);
    return `<section class="phead"><div class="wrap"><article class="art">
      <div class="crumb"><a href="#/uudised">Uudised</a> › ${a.k}</div>
      <p class="eyebrow">${a.d} · ${a.k}</p><h1 class="h1" style="font-size:clamp(36px,5vw,64px)">${esc(a.t)}</h1>
      <div class="cover"><img src="${a.img}" alt=""></div>
      <p>${esc(a.ex)} See on näidispostitus, mis näitab, kuidas täismahus artikkel lehel välja näeb: pealkiri, kaanepilt, loetav tekstilaius ja lõpus soovitused.</p>
      <h2>Alusta küsimusest, mitte koolitusest</h2>
      <p>Mõtle, kas soovid alustada täiesti uue teenusega või täiendada seda, mida juba teed. Baaskoolitused on mahukamad ja põhjalikumad, täiendkoolitused keskenduvad ühele tehnikale või teemale.</p>
      <blockquote>„Õpilase edu on meie eesmärk — seepärast algab iga koolitus sellest, kus sa praegu oled.“</blockquote>
      <h2>Vali õppevorm</h2>
      <p>E-õpe sobib, kui soovid õppida omas tempos. Kontaktõpe annab kohese praktika koolitaja kõrval. Hübriidõpe ühendab mõlemad: teooria veebis ja praktika kohapeal.</p>
      <p><a class="btn" href="#/koolitused">Vaata koolitusi</a></p>
    </article></div></section>
    <section class="sec tight"><div class="wrap"><div class="row-head"><h2 class="h2" style="font-size:clamp(26px,2.6vw,36px)">Loe veel</h2></div><div class="grid">${others.map(newsCard).join("")}</div></div></section>`;
  }

  // ---------- student ----------
  const MY = [
    { id: "kulmumeister", f: "Hübriidõpe", p: 62, st: "Pooleli", next: "Moodul 3 · Värvid ja segamine", end: "14.11.2027" },
    { id: "lami", f: "Kontaktõpe", p: 0, st: "28.11 · Tartu", next: "Kontaktpäev 28.11 kell 10:00", end: "—" },
    { id: "kuju", f: "E-õpe", p: 100, st: "Lõpetatud", next: "Tunnistus on olemas", end: "02.05.2027" },
    { id: "lashlift", f: "Kontaktõpe", p: 0, st: "Alustamata", next: "Vali kontaktpäev", end: "—" },
  ];
  function pStudent() {
    return `<div class="appbg">
      <header class="app-hdr"><div class="in"><a class="logo" href="#/"><img src="assets/logo-trim.png" alt="MS LAB" style="height:32px"></a>
        <nav aria-label="Õppija menüü"><a class="on" href="#/oppija">Minu koolitused</a><a href="#/oppija" data-soon>Tunnistused</a><a href="#/oppija" data-soon>Arved</a><a href="#/praktika">Praktika</a></nav>
        <a class="ava" href="#/"><span>Liis Tamm</span><i>L</i></a></div></header>
      <div class="wrap" style="padding-top:clamp(28px,4vw,48px);padding-bottom:64px">
        <p class="eyebrow">Õppija konto</p><h1 class="h2">Tere, Liis.</h1>
        <p class="lead" style="margin-bottom:32px">Sul on 4 koolitust. Vali koolitus, et näha selle seisu ja järgmist sammu.</p>
        <div class="courses4" id="my">${MY.map((m, i) => { const c = byId(m.id); return `<button class="cc" data-i="${i}" aria-pressed="${i === 0}"><div class="ph"><img src="${c.img}" alt="" style="object-position:${c.pos}"></div><div class="bd"><span class="k">${m.f}</span><b>${esc(c.t)}</b><div class="bar"><i style="width:${m.p}%"></i></div><div class="s"><span>${m.st}</span><span>${m.p}%</span></div></div></button>`; }).join("")}</div>
        <div id="myDetail"></div>
      </div></div>`;
  }
  function studentDetail(i) {
    const m = MY[i], c = byId(m.id);
    const mods = [["Sissejuhatus ja hügieen", 100], ["Kulmude arhitektuur", 100], ["Värvid ja segamine", m.p > 60 && m.p < 100 ? 40 : m.p], ["Praktika modellil", m.p === 100 ? 100 : 0], ["Test ja tunnistus", m.p === 100 ? 100 : 0]];
    return `<div class="dash">
      <div class="dcard hero2"><div class="bd"><span class="k">${m.p === 100 ? "Lõpetatud" : "Jätka õppimist"}</span><b>${esc(c.t)}</b><span>${m.next}</span><div class="bar"><i style="width:${m.p}%"></i></div><span>${m.p}% · ligipääs kuni ${m.end}</span><a class="btn light sm" href="#/oppija" style="margin-top:auto;align-self:flex-start">${m.p === 100 ? "Ava tunnistus" : m.p ? "Jätka ›" : "Vaata juhiseid"}</a></div><div class="ph"><img src="${c.img}" alt="" style="object-position:${c.pos}"></div></div>
      <div class="dcard"><span class="k">Kontaktpäev</span><b>${m.f === "E-õpe" ? "Puudub" : m.id === "lashlift" ? "Valimata" : m.id === "lami" ? "28.11 · Tartu" : "14.11 · Pärnu"}</b><span>${m.f === "E-õpe" ? "Täielikult veebis" : "Kell 10:00 · juhised e-kirjas"}</span></div>
      <div class="dcard"><span class="k">Tasumata jääk</span><b>${m.id === "kulmumeister" ? "€195" : "€0"}</b><span>${m.id === "kulmumeister" ? "Tähtaeg 07.11 (50% ettemaks)" : "Kõik tasutud"}</span>${m.id === "kulmumeister" ? '<button class="btn sm" data-pay>Tasu jääk</button>' : ""}</div>
      <div class="dcard"><span class="k">Praktikaprotokoll</span><b>${m.p === 100 ? "Saadaval" : "Pärast praktikat"}</b><span>${m.p === 100 ? "Koolitaja tagasiside praktikapäevast" : "Koolitaja täidab praktika ajal"}</span>${m.p === 100 ? '<button class="btn sm ghost" data-proto>Ava protokoll</button>' : ""}</div>
    </div>
    <div class="mods"><ul>${mods.map((x, j) => { const cls = x[1] === 100 ? "done" : x[1] > 0 ? "now" : "lock"; return `<li class="${cls}"><span class="ic">${cls === "done" ? "✓" : cls === "now" ? "▶" : "🔒"}</span><span>${j + 1}. ${x[0]}</span><span class="rs">${cls === "done" ? "Läbitud" : cls === "now" ? "Pooleli" : "Lukus"}</span></li>`; }).join("")}</ul></div>`;
  }
  function initStudent() {
    const draw = (i) => { $("#myDetail").innerHTML = studentDetail(i); $("[data-pay]")?.addEventListener("click", () => toast("Montonio makse — näidis.")); $("[data-proto]")?.addEventListener("click", () => toast("Protokoll avaneks PDF-ina (näidis).")); };
    $$("#my .cc").forEach((b) => (b.onclick = () => { $$("#my .cc").forEach((x) => x.setAttribute("aria-pressed", x === b)); draw(+b.dataset.i); }));
    $$("[data-soon]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); toast("See vaade tuleb järgmises etapis."); }));
    draw(0);
  }

  // ---------- admin ----------
  const PRESETS = ["Uus", "Populaarne", "Bestseller", "Enim müüdud", "Viimased kohad", "Soodus"];
  const SWATCH = [["Tint", "#222222", "#ffffff"], ["Orhidee", "#DDD4DC", "#222222"], ["Tuhkroos", "#9E8993", "#ffffff"], ["Ploom", "#6B4F5C", "#ffffff"], ["Hele", "#FFFFFF", "#222222"]];
  function pAdmin(tab) {
    return `<div class="adm">
      <aside><a class="logo lg" href="#/" style="padding:0 12px"><img src="assets/logo-trim.png" alt="MS LAB" style="height:30px"></a><p class="k">ADMIN</p>
        <a href="#/admin" class="${!tab ? "on" : ""}">Koolitused ja märgised</a><a href="#/admin/praktika" class="${tab === "praktika" ? "on" : ""}">Praktikapaketid</a><a href="#/admin/kampaania" class="${tab === "kampaania" ? "on" : ""}">Kampaania</a>
        <a href="#/admin" data-soon>Kalender</a><a href="#/admin" data-soon>Õpilased <em>3</em></a><a href="#/admin" data-soon>Tellimused</a><a href="#/admin" data-soon>Uudised</a><a href="#/admin" data-soon>Bännerid</a><a href="#/">← Avalehele</a></aside>
      <div class="main">${tab === "praktika" ? adminPkg() : tab === "kampaania" ? adminCamp() : adminBadges()}</div></div>`;
  }
  function adminBadges() {
    return `<p class="eyebrow">Tere, Maria</p><h1 class="h2" style="font-size:clamp(28px,3vw,40px)">Koolituse märgis</h1>
      <p class="muted" style="max-width:620px">Lisa koolituse kaardile silt, nt „Uus“ või „Populaarne“. Vali tekst ja värv — muudatus on kohe näha koolituste lehel. Arendajat pole vaja.</p>
      <div class="cols" style="margin-top:24px">
        <div class="card2"><div style="display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:24px" class="bcols">
          <div class="list" id="blist">${COURSES.map((c, i) => `<button data-id="${c.id}" aria-pressed="${i === 0}"><img src="${c.img}" alt=""><span>${esc(c.t)}</span></button>`).join("")}</div>
          <div id="bedit"></div></div></div>
        <div class="card2"><p class="eyebrow">Eelvaade</p><div class="prev" id="bprev"></div><p class="note">Näidis: salvestub ainult selles brauseris.</p></div>
      </div>`;
  }
  function initAdminBadges() {
    let cur = COURSES[0].id;
    const editor = () => {
      const c = byId(cur), b = c.badge || { l: "", bg: SWATCH[0][1], fg: SWATCH[0][2] };
      $("#bedit").innerHTML = `<p class="eyebrow" style="margin:0">${esc(c.t)}</p>
        <div class="fld">Kiirvalik<div class="chips"><button class="chip" data-p="" aria-pressed="${!b.l}">Puudub</button>${PRESETS.map((p) => `<button class="chip" data-p="${p}" aria-pressed="${b.l === p}">${p}</button>`).join("")}</div></div>
        <label class="fld">Oma tekst (kuni 18 märki)<input type="text" id="bl" maxlength="18" value="${esc(b.l)}" placeholder="nt. Sügise hitt"></label>
        <div class="fld">Värv<div class="sw">${SWATCH.map(([n, bg, fg]) => `<button data-bg="${bg}" data-fg="${fg}" aria-pressed="${b.bg.toLowerCase() === bg.toLowerCase()}"><i style="background:${bg}"></i>${n}</button>`).join("")}<input type="color" id="bc" value="${b.bg}" aria-label="Vali oma värv"></div></div>
        <div style="display:flex;gap:12px;align-items:center;margin-top:26px;flex-wrap:wrap"><button class="btn" id="bsave">Salvesta</button><span id="bst"></span></div>`;
      let draft = { ...b };
      const prev = () => { const tmp = { ...c, badge: draft.l ? draft : null }; $("#bprev").innerHTML = card(tmp); };
      $$("#bedit [data-p]").forEach((x) => (x.onclick = () => { draft.l = x.dataset.p; $("#bl").value = draft.l; $$("#bedit [data-p]").forEach((y) => y.setAttribute("aria-pressed", y === x)); prev(); }));
      $("#bl").oninput = (e) => { draft.l = e.target.value; $$("#bedit [data-p]").forEach((y) => y.setAttribute("aria-pressed", y.dataset.p === draft.l)); prev(); };
      $$("#bedit .sw button").forEach((x) => (x.onclick = () => { draft.bg = x.dataset.bg; draft.fg = x.dataset.fg; $$("#bedit .sw button").forEach((y) => y.setAttribute("aria-pressed", y === x)); prev(); }));
      $("#bc").oninput = (e) => { draft.bg = e.target.value; const h = draft.bg.replace("#", ""); const lum = (parseInt(h.slice(0, 2), 16) * 299 + parseInt(h.slice(2, 4), 16) * 587 + parseInt(h.slice(4, 6), 16) * 114) / 1000; draft.fg = lum > 150 ? "#222222" : "#ffffff"; $$("#bedit .sw button").forEach((y) => y.setAttribute("aria-pressed", "false")); prev(); };
      $("#bsave").onclick = () => { c.badge = draft.l ? { ...draft } : null; const all = store.get("badges", {}); all[c.id] = c.badge; store.set("badges", all); $("#bst").innerHTML = '<span class="saved">✓ Salvestatud — <a href="#/koolitused">vaata koolitusi</a></span>'; $$("#blist button").forEach((x) => { if (x.dataset.id === c.id) x.focus(); }); };
      prev();
    };
    $$("#blist button").forEach((x) => (x.onclick = () => { cur = x.dataset.id; $$("#blist button").forEach((y) => y.setAttribute("aria-pressed", y === x)); editor(); }));
    editor();
    const mq = () => { const g = $(".bcols"); if (g) g.style.gridTemplateColumns = window.innerWidth < 640 ? "1fr" : "minmax(0,220px) minmax(0,1fr)"; };
    mq(); window.addEventListener("resize", mq);
  }
  function adminPkg() {
    return `<p class="eyebrow">Praktika</p><h1 class="h2" style="font-size:clamp(28px,3vw,40px)">Praktikapaketid</h1>
      <p class="muted" style="max-width:620px">Muuda MINI ja MAXI paketi sisu. Iga rida on üks punkt. Salvestades uueneb avalik praktikaleht.</p>
      <div class="cols" style="margin-top:24px;grid-template-columns:1fr 1fr">${["MINI", "MAXI"].map((k) => `<div class="card2"><p class="eyebrow">${k}</p><textarea id="t${k}" aria-label="${k} paketi punktid">${esc(PKG[k].join("\n"))}</textarea></div>`).join("")}</div>
      <div style="display:flex;gap:12px;align-items:center;margin-top:18px;flex-wrap:wrap"><button class="btn" id="psave">Salvesta</button><button class="btn ghost" id="preset">Taasta algne</button><span id="pst"></span></div>
      <p class="note">Näidis: salvestub ainult selles brauseris.</p>`;
  }
  function initAdminPkg() {
    $("#psave").onclick = () => { ["MINI", "MAXI"].forEach((k) => (PKG[k] = $("#t" + k).value.split("\n").map((s) => s.trim()).filter(Boolean))); store.set("pkg", { MINI: PKG.MINI, MAXI: PKG.MAXI }); $("#pst").innerHTML = '<span class="saved">✓ Salvestatud — <a href="#/praktika">vaata praktikalehte</a></span>'; };
    $("#preset").onclick = () => { PKG.MINI = PKG_DEFAULT.MINI.slice(); PKG.MAXI = PKG_DEFAULT.MAXI.slice(); store.set("pkg", {}); ["MINI", "MAXI"].forEach((k) => ($("#t" + k).value = PKG[k].join("\n"))); $("#pst").textContent = "Algne sisu taastatud."; };
  }

  // ---------- campaign popup (admin-editable) ----------
  // Rules from the handoff: at most once per session, only on public pages, never in
  // checkout/lessons/tests; Esc + backdrop close; focus trapped and restored.
  const CAMP_DEFAULT = { on: true, k: "Talvine pakkumine", t: "−15% Lash Lift BOTOX koolitusele", p: "Kehtib registreerumisel kuni 30.11. Sisesta kood ostukorvis.", code: "TALV15", cta: "Vaata koolitust", link: "lashlift", img: "assets/lash-editorial.jpg" };
  const CAMP_IMGS = ["assets/lash-editorial.jpg", "assets/gift.jpg", "assets/hero-flower.jpg", "assets/eye2.jpg"];
  let CAMP = Object.assign({}, CAMP_DEFAULT, store.get("camp", {}));
  function campHtml(c) {
    return `<div class="camp-bd" data-close></div>
      <div class="camp" role="dialog" aria-modal="true" aria-labelledby="campT">
        <button class="x" data-close aria-label="Sulge">×</button>
        <div class="ph"><img src="${esc(c.img)}" alt=""></div>
        <div class="bd">
          <p class="eyebrow">${esc(c.k)}</p>
          <h2 id="campT">${esc(c.t)}</h2>
          <p class="tx">${esc(c.p)}</p>
          ${c.code ? `<div class="code"><span>${esc(c.code)}</span><button type="button" data-copy>Kopeeri</button></div>` : ""}
          <div class="acts"><a class="btn" href="#/koolitus/${esc(c.link)}" data-close-go>${esc(c.cta)}</a><button class="more" data-close>Mitte praegu</button></div>
          <p class="fine">Näidispakkumine · kuvatakse kord külastuse jooksul</p>
        </div>
      </div>`;
  }
  function openCampaign(c) {
    c = c || CAMP;
    closeCampaign();
    const root = document.createElement("div");
    root.id = "campRoot";
    root.innerHTML = campHtml(c);
    document.body.appendChild(root);
    const last = document.activeElement;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => root.classList.add("on"));
    const box = $(".camp", root);
    const focusables = () => $$("a,button", box);
    focusables()[0].focus();
    const close = () => { closeCampaign(); last && last.focus && last.focus(); };
    $$("[data-close]", root).forEach((b) => (b.onclick = close));
    $("[data-close-go]", root).onclick = () => closeCampaign();
    const cp = $("[data-copy]", root);
    if (cp) cp.onclick = () => { try { navigator.clipboard.writeText(c.code); } catch (e) {} cp.textContent = "Kopeeritud ✓"; };
    root.onkeydown = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") { const f = focusables(), a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } }
    };
  }
  function closeCampaign() { const r = $("#campRoot"); if (r) { r.remove(); document.body.style.overflow = ""; } }
  window.openCampaign = () => openCampaign();
  let campTimer = null;
  function maybeAutoCampaign(r) {
    clearTimeout(campTimer);
    if (r !== "" || !CAMP.on) return;
    let seen = false;
    try { seen = sessionStorage.getItem("mslab-studio-camp") === "1"; } catch (e) {}
    if (seen) return;
    campTimer = setTimeout(() => { try { sessionStorage.setItem("mslab-studio-camp", "1"); } catch (e) {} if (!location.hash.replace(/^#\/?/, "")) openCampaign(); }, 6000);
  }
  function adminCamp() {
    const c = CAMP;
    return `<p class="eyebrow">Turundus</p><h1 class="h2" style="font-size:clamp(28px,3vw,40px)">Kampaania hüpikaken</h1>
      <p class="muted" style="max-width:640px">Esilehel kord külastuse jooksul kuvatav pakkumine. Muuda teksti, koodi ja pilti ise — ostukorvis, tundides ja testides seda ei kuvata.</p>
      <div class="cols" style="margin-top:24px"><div class="card2">
        <label class="fld" style="flex-direction:row;align-items:center;gap:10px;margin-top:0"><input type="checkbox" id="cOn" ${c.on ? "checked" : ""} style="width:20px;height:20px;accent-color:#222"> Kampaania on aktiivne</label>
        <label class="fld">Silt<input type="text" id="cK" value="${esc(c.k)}"></label>
        <label class="fld">Pealkiri<input type="text" id="cT" value="${esc(c.t)}"></label>
        <label class="fld">Tekst<input type="text" id="cP" value="${esc(c.p)}"></label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px"><label class="fld">Sooduskood<input type="text" id="cC" value="${esc(c.code)}"></label><label class="fld">Nupu tekst<input type="text" id="cA" value="${esc(c.cta)}"></label></div>
        <label class="fld">Nupp viib koolitusele<select id="cL" style="min-height:46px;border-radius:12px;border:1px solid var(--heather);padding:0 12px">${COURSES.map((x) => `<option value="${x.id}"${x.id === c.link ? " selected" : ""}>${esc(x.t)}</option>`).join("")}</select></label>
        <div class="fld">Pilt<div class="sw">${CAMP_IMGS.map((s) => `<button data-img="${s}" aria-pressed="${s === c.img}" style="padding:4px"><img src="${s}" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover"></button>`).join("")}</div></div>
        <div style="display:flex;gap:12px;align-items:center;margin-top:26px;flex-wrap:wrap"><button class="btn" id="cSave">Salvesta</button><button class="btn ghost" id="cPrev">Eelvaade</button><button class="btn ghost" id="cReset">Taasta algne</button><span id="cSt"></span></div>
      </div>
      <div class="card2"><p class="eyebrow">Reeglid</p><ul class="outc" style="font-size:15px"><li>Kuvatakse esilehel 6 sekundi pärast</li><li>Kord külastuse jooksul</li><li>Mitte ostukorvis, tundides ega testides</li><li>Sulgub Esc, ✕ või taustale vajutades</li></ul><p class="note">Näidis: salvestub ainult selles brauseris.</p></div></div>`;
  }
  function initAdminCamp() {
    let img = CAMP.img;
    const draft = () => ({ on: $("#cOn").checked, k: $("#cK").value, t: $("#cT").value, p: $("#cP").value, code: $("#cC").value.trim(), cta: $("#cA").value || "Vaata koolitust", link: $("#cL").value, img });
    $$("[data-img]").forEach((b) => (b.onclick = () => { img = b.dataset.img; $$("[data-img]").forEach((x) => x.setAttribute("aria-pressed", x === b)); }));
    $("#cPrev").onclick = () => openCampaign(draft());
    $("#cSave").onclick = () => { CAMP = draft(); store.set("camp", CAMP); try { sessionStorage.removeItem("mslab-studio-camp"); } catch (e) {} $("#cSt").innerHTML = '<span class="saved">✓ Salvestatud — kuvatakse esilehel</span>'; };
    $("#cReset").onclick = () => { CAMP = Object.assign({}, CAMP_DEFAULT); store.set("camp", {}); render(); };
  }

  // ---------- router ----------
  function parse() {
    const h = location.hash.replace(/^#\/?/, "");
    const [path, qs] = h.split("?");
    return { parts: path.split("/").filter(Boolean), q: new URLSearchParams(qs || "") };
  }
  function render() {
    clearTimeout(heroTimer);
    closeCampaign();
    document.body.classList.remove("has-buy");
    const { parts, q } = parse();
    const r = parts[0] || "";
    maybeAutoCampaign(r);
    const main = $("#main"), hdr = $("#hdr");
    const app = r === "oppija" || r === "admin";
    hdr.hidden = app;
    hdr.className = "hdr";
    hdr.dataset.tone = "light";
    if (!app) renderHeader(r === "koolitus" ? "koolitused" : r === "uudis" ? "uudised" : r);
    renderFooter(!app);
    let init = null, title = "";
    switch (r) {
      case "": main.innerHTML = pHome(); init = initHome; hdr.classList.add("over"); title = "Avaleht"; break;
      case "koolitused": main.innerHTML = pCatalog(q); init = () => initCatalog(q); title = "Koolitused"; break;
      case "koolitus": main.innerHTML = pCourse(parts[1]); init = initCourse; title = (byId(parts[1]) || COURSES[0]).t; break;
      case "kalender": main.innerHTML = pCalendar(q); init = () => initCalendar(q); title = "Koolituskalender"; break;
      case "praktika": main.innerHTML = pPractice(); init = initPractice; title = "Praktika"; break;
      case "koolitaja": main.innerHTML = pTrainer(); title = "Koolitaja"; break;
      case "uudised": main.innerHTML = pNewsList(); title = "Uudised"; break;
      case "uudis": main.innerHTML = pArticle(parts[1]); title = "Uudis"; break;
      case "oppija": main.innerHTML = pStudent(); init = initStudent; title = "Minu koolitused"; break;
      case "admin": main.innerHTML = pAdmin(parts[1]); init = parts[1] === "praktika" ? initAdminPkg : parts[1] === "kampaania" ? initAdminCamp : initAdminBadges; title = "Admin"; break;
      default: location.hash = "#/"; return;
    }
    document.title = `${title} — MS LAB Koolituskeskus`;
    init && init();
    wireCarousels();
    $$("[data-soon]", main).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); toast("See vaade tuleb järgmises etapis."); }));
    onScroll();
    // In-page anchors like #pk / #proto shouldn't be treated as routes.
    $$('a[href^="#"]:not([href^="#/"])', main).forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); const t = document.getElementById(a.getAttribute("href").slice(1)); t && t.scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); }));
  }
  function onScroll() {
    const h = $("#hdr");
    if (!h.classList.contains("over")) return;
    const hero = $("#hero");
    const lim = hero ? hero.offsetHeight - 80 : 40;
    h.classList.toggle("solid", window.scrollY > lim);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  document.addEventListener("keydown", (e) => {
    const hero = $("#hero");
    if (!hero || !hero.contains(document.activeElement)) return;
    if (e.key === "ArrowRight") $$(".arr", hero)[1].click();
    if (e.key === "ArrowLeft") $$(".arr", hero)[0].click();
  });
  if (!location.hash) history.replaceState(null, "", "#/");
  render();

  // small prototype helper so reviewers can reach the logged-in views
  const pn = document.createElement("div");
  pn.className = "proto-note";
  pn.innerHTML = 'Prototüüp <a href="#/">Veebileht</a><a href="#/oppija">Õppija</a><a href="#/admin">Admin</a><a href="#/" data-camp>Kampaania</a>';
  document.body.appendChild(pn);
  $("[data-camp]", pn).onclick = (e) => { e.preventDefault(); openCampaign(); };
})();
