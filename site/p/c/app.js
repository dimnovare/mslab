/* MS LAB Koolituskeskus — direction C. Vanilla JS, hash routing. All data is sample data. */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ i18n (spec §6 + a few extra keys) */
  var copy = {
    et: {
      nav: ["Koolitused", "Koolituskalender", "Praktika", "Koolitaja", "Uudised"],
      login: "Logi sisse",
      cart: "Ostukorv",
      calendar: "Vaata koolituskalendrit",
      hero: [
        ["Meie lubadus", "Õpilase edu on meie eesmärk!", "Praktiline ja personaalne õpe, mis annab julguse alustada."],
        ["Baaskoolitus", "Kulmumeistri baaskoolitus", "Tugev alus, läbimõeldud tehnika ja juhendatud praktika."],
        ["Uus oskus", "Lash Lift BOTOX", "Professionaalne tulemus personaalse juhendamise toel."],
        ["Praktika", "MINI ja MAXI paketid", "Rohkem kindlust päris modellidega harjutades."],
        ["E-õpe", "Õpi omas tempos", "Selged videod ja õppematerjalid on sulle alati kättesaadavad."]
      ],
      discover: "Tutvu koolitusega",
      choose: "Vali oma koolitus",
      upcoming: "Tulevased koolitused",
      trainer: "Sinu koolitaja",
      practice: "Praktika modellidega",
      reviews: "Õpilaste kogemused",
      news: "Uudised ja nõuanded",
      sample: "Näidisandmed",
      view: "Vaata koolitust",
      register: "Registreeru",
      more: "Loe edasi",
      newsletter: "Uudised, nõuanded ja −10% esimesest ostust",
      join: "Liitu",
      email: "E-posti aadress",
      /* extra */
      heroTitle: ["Kunst", "pilgus"],
      cta: "Vali koolitus",
      allDates: "Kõik kuupäevad",
      formats: "Õppevormid",
      formatsTitle: "Vali endale sobiv <em>õppevorm</em>"
    },
    ru: {
      nav: ["Курсы", "Календарь", "Практика", "Преподаватель", "Новости"],
      login: "Войти",
      cart: "Корзина",
      calendar: "Смотреть календарь",
      hero: [
        ["Наше обещание", "Успех ученика — наша цель!", "Практичное и личное обучение, которое придаёт уверенность."],
        ["Базовый курс", "Базовый курс бровиста", "Прочная база, продуманная техника и практика с поддержкой."],
        ["Новый навык", "Lash Lift BOTOX", "Профессиональный результат под личным руководством."],
        ["Практика", "Пакеты MINI и MAXI", "Больше уверенности благодаря практике на моделях."],
        ["Онлайн", "Учитесь в своём темпе", "Понятные видео и материалы всегда доступны."]
      ],
      discover: "Узнать о курсе",
      choose: "Выберите свой курс",
      upcoming: "Ближайшие курсы",
      trainer: "Ваш преподаватель",
      practice: "Практика с моделями",
      reviews: "Отзывы учеников",
      news: "Новости и советы",
      sample: "Пример данных",
      view: "Смотреть курс",
      register: "Записаться",
      more: "Читать далее",
      newsletter: "Новости, советы и −10% на первую покупку",
      join: "Подписаться",
      email: "Электронная почта",
      heroTitle: ["Искусство", "взгляда"],
      cta: "Выбрать курс",
      allDates: "Все даты",
      formats: "Форматы обучения",
      formatsTitle: "Выберите подходящий <em>формат</em>"
    }
  };

  var state = {
    lang: "et",
    cart: [],
    catalog: { q: "", format: "all", level: "all" },
    calCity: "all",
    calFormat: "all",
    homeTab: "e",
    portalIdx: 0,
    admin: null,
    detailSel: {}
  };
  function t(k) { return copy[state.lang][k]; }

  /* ------------------------------------------------------------------ Data (sample) */
  var FORMATS = {
    e: {
      key: "e", name: "E-õpe", gen: "e-õppe", short: "Veebis, omas tempos", title: "E-õpe — õpi omas tempos",
      def: "Täielikult veebipõhine õpe. Videotunnid, õppematerjalid ja testid on sulle kättesaadavad õpilase kontol — õpid siis, kui sulle sobib, ja naased materjalide juurde nii tihti kui vaja.",
      bars: [["Teooria veebis", 100, ""], ["Praktika kohapeal", 0, "ink"]],
      facts: [["Kus", "Õpilase kontol veebis"], ["Tempo", "Omas tempos, ligipääs 6 kuud"], ["Sobib", "Täiendajale ja iseseisvale õppijale"], ["Lõpetamine", "Test ja tunnistus"]],
      steps: [
        ["Vali sobiv koolitus", ""],
        ["Lisa koolitus ostukorvi", ""],
        ["Vormista ost", ""],
        ["Sulle luuakse automaatselt õpilase konto", ""],
        ["Logi sisse ja alusta õppimist", ""]
      ]
    },
    kontakt: {
      key: "kontakt", name: "Kontaktõpe", gen: "kontaktõppe", short: "Kohapeal, individuaalselt või grupis", title: "Kontaktõpe — kohapeal koolitajaga",
      def: "Füüsiline õpe koolituskeskuses kohapeal — individuaalselt või väikeses grupis. Teooria ja praktika toimuvad koolitaja juhendamisel samas ruumis, kõik vajalikud vahendid on kohapeal olemas.",
      bars: [["Teooria kohapeal", 40, "ink"], ["Praktika kohapeal", 60, ""]],
      facts: [["Kus", "Pärnu, Tallinn, Tartu, Viljandi"], ["Vorm", "Individuaalselt või väikeses grupis"], ["Praktika", "Modellidega, koolitaja juhendamisel"], ["Lõpetamine", "Praktikaprotokoll ja tunnistus"]],
      steps: [
        ["Vali koolitus ja sobiv kuupäev", "Koolituskalendrist näed linna ja vabu kohti"],
        ["Lisa koolitus ostukorvi", ""],
        ["Vormista ost", ""],
        ["Saad kinnituse ja ettevalmistava info", "E-postile koos päevakavaga"],
        ["Tule koolitusele", "Õpid koolitaja juhendamisel kohapeal"]
      ]
    },
    hybriid: {
      key: "hybriid", name: "Hübriidõpe", gen: "hübriidõppe", short: "Teooria veebis, praktika kohapeal", title: "Hübriidõpe — e-õpe + kontaktõpe",
      def: "Parim mõlemast: teooria omandad veebis omas tempos, praktika toimub kohapeal koolitaja juhendamisel. Tuled praktikapäevale juba ettevalmistunult.",
      bars: [["Teooria veebis", 60, ""], ["Praktika kohapeal", 40, "ink"]],
      facts: [["Teooria", "Veebis, õpilase kontol"], ["Praktika", "Kohapeal koolitajaga"], ["Sobib", "Töö või pere kõrvalt õppijale"], ["Lõpetamine", "Praktikaprotokoll ja tunnistus"]],
      steps: [
        ["Vali sobiv koolitus", ""],
        ["Lisa ostukorvi ja vormista ost", ""],
        ["Sulle luuakse automaatselt õpilase konto", ""],
        ["Õpi teooria veebis", "Videod ja materjalid omas tempos"],
        ["Praktika kohapeal koolitajaga", "Valitud linnas ja kuupäeval"]
      ]
    }
  };
  var FORMAT_BY_NAME = { "E-õpe": "e", "Kontaktõpe": "kontakt", "Hübriidõpe": "hybriid" };

  var courses = [
    { id: "brow", title: "Kulmumeistri baaskoolitus", titleRu: "Базовый курс бровиста", format: "Hübriidõpe", price: 590, city: "Pärnu", image: "manual.jpg", pos: "50% 55%", lang: "ET / RU", level: "Baaskoolitus", badge: { label: "Bestseller", tone: "ink" },
      options: [["E-õpe", 390], ["Kontaktõpe", 690], ["Hübriidõpe", 590]], duration: "E-õpe + 2 praktikapäeva",
      lead: "Tugev alus, läbimõeldud tehnika ja juhendatud praktika. Õpid kulmude arhitektuuri, värvimise ja korrigeerimise nullist — koos MS LAB õpiku ja stardikomplektiga." },
    { id: "lashlift", title: "Lash Lift BOTOX", titleRu: "Ламинирование ресниц Lash Lift BOTOX", format: "Kontaktõpe", price: 390, city: "Tallinn", image: "brow1.jpg", pos: "50% 50%", lang: "ET", level: "Baaskoolitus", badge: { label: "Populaarne", tone: "rose" },
      options: [["Kontaktõpe", 390], ["Hübriidõpe", 340]], duration: "1 päev",
      lead: "Professionaalne tulemus personaalse juhendamise toel. Ripsmete tõstmine ja toitev BOTOX-hooldus samm-sammult." },
    { id: "lami", title: "Kulmude LAMI", titleRu: "Долговременная укладка бровей LAMI", format: "Kontaktõpe", price: 350, city: "Tartu", image: "scis.jpg", pos: "50% 45%", lang: "RU", level: "Täiendkoolitus", badge: { label: "Uus", tone: "rose" },
      options: [["Kontaktõpe", 350]], duration: "1 päev",
      lead: "Kulmude laminatsioon ehk pikaajaline kujundamine. Täiendkoolitus meistrile, kes soovib pakkuda moodsat ja nõutud teenust." },
    { id: "2in1", title: "2in1 koolituspakett", titleRu: "Пакет 2в1: брови + ресницы", format: "Hübriidõpe", price: 890, city: "Pärnu", image: "certificate.jpg", pos: "50% 40%", lang: "ET / RU", level: "Baaskoolitus", badge: null,
      options: [["Hübriidõpe", 890], ["Kontaktõpe", 990]], duration: "E-õpe + 3 praktikapäeva",
      lead: "Kulmumeistri baaskoolitus ja Lash Lift BOTOX ühes paketis — kaks teenust, üks tunnistus ja soodsam hind." },
    { id: "symmetry", title: "Kulmukuju ja sümmeetria", titleRu: "Форма и симметрия бровей", format: "E-õpe", price: 190, city: "Veebis", image: "hand.jpg", pos: "50% 30%", lang: "ET / RU", level: "Täiendkoolitus", badge: { label: "Uus", tone: "ink" },
      options: [["E-õpe", 190]], duration: "Omas tempos · 6 kuud",
      lead: "Veebikoolitus kulmude mõõtmisest, proportsioonidest ja sümmeetriast. Selged videod ja harjutused, mida saad kohe klienditöös kasutada." },
    { id: "lashlami", title: "Ripsmete laminatsioon", titleRu: "Ламинирование ресниц", format: "Hübriidõpe", price: 450, city: "Viljandi", image: "eyebw.jpg", pos: "50% 45%", lang: "ET", level: "Baaskoolitus", badge: null,
      options: [["Hübriidõpe", 450], ["Kontaktõpe", 490]], duration: "E-õpe + 1 praktikapäev",
      lead: "Ripsmete laminatsiooni tehnika, koostised ja kliendi nõustamine. Teooria veebis, praktika koolitaja juhendamisel." }
  ];
  var COURSE = {}; courses.forEach(function (c) { COURSE[c.id] = c; });

  // Restore admin-edited badges (per-viewer convenience only)
  try {
    var saved = JSON.parse(localStorage.getItem("mslab-c-badges") || "null");
    if (saved) Object.keys(saved).forEach(function (id) { if (COURSE[id]) COURSE[id].badge = saved[id]; });
  } catch (e) { /* storage unavailable */ }

  var sessions = [
    ["2026-10-17", "brow", "Pärnu", "Kontaktõpe", "ET / RU", "3 kohta"],
    ["2026-10-24", "lashlift", "Tallinn", "Kontaktõpe", "ET", "Viimased kohad"],
    ["2026-10-31", "brow", "Tartu", "Hübriidõpe", "ET", "Avatud"],
    ["2026-11-07", "lami", "Tartu", "Kontaktõpe", "RU", "Täis"],
    ["2026-11-14", "2in1", "Pärnu", "Hübriidõpe", "ET / RU", "Avatud"],
    ["2026-11-21", "lashlift", "Pärnu", "Kontaktõpe", "RU", "3 kohta"],
    ["2026-11-28", "lashlami", "Viljandi", "Hübriidõpe", "ET", "Avatud"],
    ["2026-12-05", "brow", "Tallinn", "Kontaktõpe", "ET / RU", "Viimased kohad"],
    ["2026-12-12", "lami", "Pärnu", "Kontaktõpe", "ET", "Avatud"],
    ["2027-01-16", "brow", "Pärnu", "Hübriidõpe", "ET", "Avatud"],
    ["2027-01-23", "lashlift", "Tartu", "Kontaktõpe", "ET / RU", "Avatud"],
    ["2027-01-30", "2in1", "Tallinn", "Hübriidõpe", "RU", "Avatud"]
  ].map(function (r) {
    return { date: r[0], course: r[1], city: r[2], format: r[3], language: r[4], status: r[5], tone: { "3 kohta": "success", "Viimased kohad": "warning", "Täis": "danger", "Avatud": "success" }[r[5]] };
  });
  var CITIES = ["Pärnu", "Tallinn", "Tartu", "Viljandi"];

  var news = [
    { id: "n1", img: "clip.jpg", date: "22.09.2026", cat: "Uudis", title: "Uus Kulmude LAMI koolitus nüüd ka Tartus", ex: "Täiendkoolitus kulmude laminatsioonist jõuab novembris Tartusse — väike grupp, palju praktikat.",
      body: ["Kulmude LAMI on üks enim küsitud täiendkoolitusi. Novembrist toimub see ka Tartus, et Lõuna-Eesti meistritel oleks lihtsam osaleda.", "Koolitus on mõeldud meistrile, kellel on kulmude baasoskused olemas. Päev koosneb lühikesest teooriast ja juhendatud praktikast modellidega.", "Kohad on piiratud — vaata vabu kohti koolituskalendrist."] },
    { id: "n2", img: "eye2.jpg", date: "15.09.2026", cat: "Nõuanne", title: "Kuidas valida kliendile õige kulmuvärvi toon", ex: "Juuksevärv, nahatoon ja soovitud efekt — kolm asja, mida enne värvi segamist vaadata.",
      body: ["Õige toon sünnib vaatlusest. Enne värvi valimist vaata kliendi loomulikku juuksevärvi juurtest, nahatooni ja silmade värvi.", "Heledama kliendi puhul vali toon pigem pool astet heledam — kulm peab raamima, mitte domineerima.", "Kui kahtled, tee proovitoon väiksele alale ja kontrolli tulemust päevavalguses."] },
    { id: "n3", img: "gift-bag.jpg", date: "08.09.2026", cat: "Õppimine", title: "Mida sisaldab MS LAB õpilase stardikomplekt", ex: "Iga baaskoolituse õpilane saab kaasa MS LAB õpiku ja kingituse — vaata, mis kotis on.",
      body: ["Baaskoolituse õpilane saab MS LAB õpiku, mis on koostatud koolituse ülesehituse järgi — nii on lihtne hiljem materjali juurde naasta.", "Lisaks ootab sind kingitus: ripsme- ja kulmuseerum, mida saad soovitada ka oma klientidele.", "Stardikomplekti täpne sisu sõltub valitud koolitusest."] },
    { id: "n4", img: "mua.jpg", date: "01.09.2026", cat: "Praktika", title: "Kuidas valmistuda esimeseks praktikapäevaks", ex: "Modellid leiame meie — sinu ülesanne on tulla puhanuna ja küsimustega.",
      body: ["Praktikapäeval töötad päris modellidega koolitaja juhendamisel. Kõik vajalikud vahendid on kohapeal olemas.", "Vaata enne üle e-õppe videod ja märgi üles küsimused — nii saad koolitajalt maksimaalse kasu.", "Päeva lõpus täidab koolitaja praktikaprotokolli, mille saad hiljem endale."] },
    { id: "n5", img: "certificate-white.jpg", date: "25.08.2026", cat: "Uudis", title: "Tunnistus ja mis saab pärast koolitust", ex: "Tunnistus on alles algus — räägime, kuidas esimesed kliendid leida.",
      body: ["Koolituse lõpus saad MS LAB tunnistuse. See kinnitab, et oled läbinud teooria ja juhendatud praktika.", "Pärast koolitust on sul endiselt ligipääs e-õppe materjalidele, et saaksid tehnikaid värskendada.", "Soovi korral saad broneerida lisapraktika MINI või MAXI paketiga."] },
    { id: "n6", img: "brow2.jpg", date: "18.08.2026", cat: "Nõuanne", title: "Hübriidõpe: teooria veebis, praktika kohapeal", ex: "Miks valib üha rohkem õpilasi hübriidõppe ja kellele see kõige paremini sobib.",
      body: ["Hübriidõppes õpid teooria veebis omas tempos ning tuled kohapeale ainult praktikaks.", "See sobib hästi neile, kes õpivad töö või pere kõrvalt või elavad koolituskeskusest kaugemal.", "Praktikapäeval on sul teooria juba selge ja aega jääb rohkem harjutamiseks."] }
  ];

  var reviews = [
    ["Kertu L.", "Kulmumeistri baaskoolitus", "Maria selgitab kõike rahulikult ja põhjalikult. Praktikapäeval tundsin, et koolitaja on kogu aeg toeks — nüüd teen kulme juba oma klientidele."],
    ["Anastassia K.", "Lash Lift BOTOX · Hübriidõpe", "Hübriidõpe sobis mulle ideaalselt: teooria õppisin õhtuti kodus, praktika toimus Pärnus. Praktikaprotokollist oli hiljem väga palju abi."],
    ["Kristiina M.", "2in1 koolituspakett", "Väike grupp, kvaliteetsed materjalid ja palju praktilisi näpunäiteid. Soovitan kõigile, kes tahavad alustada kindlalt ja õigesti."]
  ];

  var enrolled = [
    { id: "brow", format: "Hübriidõpe", progress: 64, access: "30.03.2027", next: ["17.10.2026", "Pärnu", "L kell 10:00"], balance: ["0 €", "Tasutud"], cert: ["Pärast praktikat", "Väljastatakse praktikapäeval"], practice: ["MAXI kinnitatud", "18.10.2026 · 4 modelli"] },
    { id: "lashlift", format: "Kontaktõpe", progress: 20, access: "24.04.2027", next: ["24.10.2026", "Tallinn", "L kell 10:00"], balance: ["150 €", "Tasuda 10.10.2026"], cert: ["Pole väljastatud", "Pärast koolitust"], practice: ["MINI ootab", "Vali praktikapäev"] },
    { id: "symmetry", format: "E-õpe", progress: 100, access: "15.01.2027", next: ["—", "Veebis", "E-õpe, kontaktpäeva pole"], balance: ["0 €", "Tasutud"], cert: ["Väljastatud", "Laadi alla PDF"], practice: ["Ei ole nõutud", "E-õppe kursus"] },
    { id: "lami", format: "Kontaktõpe", progress: 0, access: "Algab 07.11.2026", next: ["07.11.2026", "Tartu", "L kell 10:00"], balance: ["350 €", "Arve tasumata"], cert: ["—", "Pärast koolitust"], practice: ["—", "Sisaldub koolituses"] }
  ];
  var LESSONS = {
    brow: ["Sissejuhatus ja hügieen", "Kliendi konsultatsioon", "Kulmude arhitektuur ja mõõtmine", "Värvid ja koloristika", "Värvimise tehnika", "Korrigeerimine pintsetiga", "Praktikaks valmistumine", "Klienditöö ja hinnastamine"],
    lashlift: ["Sissejuhatus ja ohutus", "Ripsmete anatoomia", "Rullikute valik", "Lifting samm-sammult", "BOTOX-hooldus", "Järelhooldus ja nõustamine"],
    symmetry: ["Proportsioonide alused", "Näokuju analüüs", "Mõõtmine niidiga", "Sümmeetria parandamine", "Harjutused ja test"],
    lami: ["Sissejuhatus", "Koostised ja ohutus", "LAMI tehnika", "Värvimine pärast LAMI-t", "Järelhooldus"]
  };

  var MODULES = {
    brow: [
      ["Sissejuhatus ja hügieen", "E-õpe · 45 min", ["Tööohutus ja desinfitseerimine", "Töökoha ettevalmistus", "Vastunäidustused ja kliendi ankeet"]],
      ["Kulmude arhitektuur", "E-õpe · 1 h 20 min", ["Näo proportsioonid", "Kulmukuju modelleerimine", "Mõõtmine ja sümmeetria"]],
      ["Värvid ja toonid", "E-õpe · 1 h", ["Koloristika alused", "Värvi ja henna erinevused", "Tooni valik kliendile"]],
      ["Korrigeerimine", "E-õpe · 50 min", ["Pintsetiga korrigeerimine", "Vahatamine", "Levinumad vead"]],
      ["Praktika modellidega", "Kohapeal · 2 päeva", ["Töö 2–4 modelliga", "Koolitaja jooksev tagasiside", "Praktikaprotokoll"]],
      ["Klienditöö ja alustamine", "E-õpe · 40 min", ["Hinnastamine", "Tööde pildistamine", "Esimesed kliendid"]]
    ],
    generic: [
      ["Teooria ja ohutus", "45 min", ["Tööohutus ja hügieen", "Materjalid ja koostised", "Vastunäidustused"]],
      ["Tehnika samm-sammult", "1 h 30 min", ["Ettevalmistus", "Protseduuri etapid", "Levinumad vead"]],
      ["Praktika", "Kohapeal", ["Töö modelliga", "Koolitaja tagasiside", "Praktikaprotokoll"]],
      ["Järelhooldus ja nõustamine", "30 min", ["Kliendi nõustamine", "Kodune hooldus", "Korduvkülastus"]]
    ]
  };

  /* ------------------------------------------------------------------ Helpers */
  var MONTHS = ["jaanuar", "veebruar", "märts", "aprill", "mai", "juuni", "juuli", "august", "september", "oktoober", "november", "detsember"];
  var MON_S = ["jaan", "veebr", "märts", "apr", "mai", "juuni", "juuli", "aug", "sept", "okt", "nov", "dets"];
  var WD = ["P", "E", "T", "K", "N", "R", "L"];
  function pd(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fDate(s) { var d = pd(s); return d.getDate() + ". " + MON_S[d.getMonth()] + " " + d.getFullYear(); }
  function fShort(s) { var d = pd(s); return d.getDate() + ". " + MON_S[d.getMonth()]; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function eur(n) { return n.toLocaleString("et-EE") + " €"; }
  function nextSession(id) { for (var i = 0; i < sessions.length; i++) if (sessions[i].course === id) return sessions[i]; return null; }
  function ctitle(c) { return state.lang === "ru" && c.titleRu ? c.titleRu : c.title; }
  function sample() { return '<span class="sample">' + t("sample") + "</span>"; }

  var ICONS = {
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    arrowUR: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    pin: '<path d="M12 21s-7-6.1-7-11.2A7 7 0 0 1 19 9.8C19 14.9 12 21 12 21Z"/><circle cx="12" cy="10" r="2.5"/>',
    cal: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    play: '<path d="M8 5.5v13l11-6.5Z"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 14 -1.5 7.5 5-3 5 3-1.5-7.5"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 20a6.5 6.5 0 0 0-2.5-5.1"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    heart: '<path d="M12 20s-7.5-4.5-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.5 12 20 12 20Z"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    tools: '<path d="M14.5 6.5 17.5 3.5l3 3-3 3"/><path d="m17.5 6.5-11 11"/><path d="m4 20 2.5-2.5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    clip: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2.5h6V4"/><path d="M9 11h6M9 15h6"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z" fill="currentColor" stroke="none"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    tag: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9Z"/><circle cx="8" cy="8" r="1.5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/>'
  };
  function icon(n, cls) {
    return '<svg class="' + (cls || "i-" + n) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + "</svg>";
  }

  function stepsHTML(steps, extra) {
    return '<ol class="steps ' + (extra || "") + '">' + steps.map(function (s, i) {
      return '<li class="step"><span class="num" aria-hidden="true">0' + (i + 1) + '</span><span class="txt"><span class="sr-only">Samm ' + (i + 1) + ": </span>" + s[0] + (s[1] ? "<small>" + s[1] + "</small>" : "") + "</span></li>";
    }).join("") + "</ol>";
  }

  function badgeHTML(b) { return b && b.label ? '<span class="pill pill--' + (b.tone === "ink" ? "ink" : "rose") + ' badge">' + esc(b.label) + "</span>" : ""; }

  function courseCard(c, opts) {
    opts = opts || {};
    var s = nextSession(c.id);
    var when = c.format === "E-õpe" || !s
      ? icon("play") + "<span>Alusta kohe</span><span class='sep-dot'></span><span class='city'>Veebis</span>"
      : icon("cal") + "<span>" + fDate(s.date) + "</span><span class='sep-dot'></span><span class='city'>" + s.city + "</span>";
    var title = opts.preview ? esc(ctitle(c)) : '<a href="#/koolitus/' + c.id + '">' + esc(ctitle(c)) + "</a>";
    return '<article class="course-card">' +
      '<div class="media">' + badgeHTML(c.badge) +
      '<img src="assets/' + c.image + '" alt="" loading="lazy" style="object-position:' + c.pos + '">' +
      "</div>" +
      (opts.preview ? '<div class="body-pad">' : "") +
      '<div class="tags"><span class="tag">' + c.format + '</span><span class="tag">' + c.level + '</span><span class="tag">' + c.lang + "</span></div>" +
      "<h3>" + title + "</h3>" +
      '<div class="next">' + when + "</div>" +
      '<div class="foot"><span class="price"><small>alates</small>' + eur(c.price) + '</span><span class="arrow-circle" aria-hidden="true">' + icon("arrow") + "</span></div>" +
      (opts.preview ? "</div>" : "") +
      "</article>";
  }

  /* ------------------------------------------------------------------ Views */
  function viewHome() {
    var h = t("hero")[0], ht = t("heroTitle");
    var top = sessions.slice(0, 3);
    var f = FORMATS[state.homeTab];
    return '<div class="view">' +
      /* Hero */
      '<section class="hero"><div class="container hero-grid">' +
      '<div class="hero-copy">' +
      '<span class="eyebrow eyebrow--rose">' + h[0] + "</span>" +
      '<h1 class="hero-title">' + ht[0] + ' <span class="accent">' + ht[1] + "</span></h1>" +
      '<p class="hero-slogan">' + h[1] + "</p>" +
      '<p class="lead">' + h[2] + "</p>" +
      '<div class="btn-row"><a class="btn btn--primary" href="#/koolitused">' + t("cta") + " " + icon("arrow") + '</a><a class="btn btn--outline" href="#/koolituskalender">' + t("calendar") + "</a></div>" +
      '<div class="hero-trust"><div><strong>8+</strong>aastat kogemust</div><div><strong>3</strong>õppevormi</div><div><strong>4</strong>linna Eestis</div></div>' +
      "</div>" +
      '<div class="hero-visual">' +
      '<div class="tint" aria-hidden="true"></div>' +
      '<span class="hero-tagline" aria-hidden="true">Brow &amp; Lash Academy</span>' +
      '<div class="portrait"><img src="assets/maria-portrait.jpg" alt="Maria Sosnina, MS LAB koolitaja" width="853" height="1140" fetchpriority="high"></div>' +
      '<div class="float-card"><img src="assets/manual.jpg" alt="MS LAB kulmumeistri baaskoolituse õpik" loading="lazy"><div class="cap"><strong>MS LAB õpik</strong>Õppematerjal on hinna sees</div></div>' +
      "</div>" +
      "</div></section>" +
      /* Quick strip */
      '<section class="quick" aria-labelledby="q-h"><div class="container">' +
      '<div class="quick-head"><span class="eyebrow" id="q-h">' + t("upcoming") + "</span>" + '<span style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' + sample() + '<a class="text-link" href="#/koolituskalender"><span>' + t("allDates") + "</span>" + icon("arrow") + "</a></span></div>" +
      '<div class="quick-grid">' + top.map(function (s, i) {
        var c = COURSE[s.course];
        return '<a class="quick-item" href="#/koolitus/' + c.id + '"><span class="q-num">0' + (i + 1) + '</span><span><span class="q-title">' + esc(ctitle(c)) + '</span><span class="q-meta"><span>' + s.format + '</span><span class="sep-dot"></span><span>' + fShort(s.date) + '</span><span class="sep-dot"></span><span class="city">' + s.city + '</span></span></span><span class="q-arrow" aria-hidden="true">' + icon("arrowUR") + "</span></a>";
      }).join("") + "</div></div></section>" +
      /* Formats */
      '<section class="section" aria-labelledby="f-h"><div class="container">' +
      '<div class="section-head"><div><span class="eyebrow">' + t("formats") + '</span><h2 class="title" id="f-h">' + t("formatsTitle") + "</h2></div>" +
      '<div class="segmented" role="tablist" aria-label="Õppevormid">' + ["e", "kontakt", "hybriid"].map(function (k) {
        return '<button type="button" role="tab" id="tab-' + k + '" aria-controls="fmt-panel" aria-selected="' + (k === state.homeTab) + '" tabindex="' + (k === state.homeTab ? 0 : -1) + '" data-home-tab="' + k + '">' + FORMATS[k].name + "</button>";
      }).join("") + "</div></div>" +
      '<div id="fmt-panel" role="tabpanel" aria-labelledby="tab-' + f.key + '">' + formatPanel(f) + "</div>" +
      "</div></section>" +
      /* Trainer */
      '<section class="section section--panel" id="koolitaja" aria-labelledby="t-h"><div class="container trainer-grid">' +
      '<div class="trainer-visual"><div class="tint" aria-hidden="true"></div><div class="ph"><img src="assets/maria-standing.jpg" alt="Maria Sosnina stuudios" loading="lazy" width="800" height="1073"></div><div class="stamp"><strong>8+</strong><span>aastat kogemust</span></div></div>' +
      '<div><span class="eyebrow">' + t("trainer") + '</span><h2 class="title" id="t-h">Maria Sosnina</h2><p class="role">Kulmu- ja ripsmetehnikate meister &amp; koolitaja</p>' +
      '<p class="lead">Maria on töötanud kulmu- ja ripsmetehnikatega üle kaheksa aasta ning koolitab meistreid nii Eestis kui ka välismaal. Tema koolitustel on tähtis rahulik tempo, selge struktuur ja päris praktika — et iga õpilane lahkuks kindlustundega.</p>' +
      '<div class="points">' +
      '<div>' + icon("award") + "<p><strong>8+ aastat kogemust</strong><span>Tuhanded tehtud protseduurid</span></p></div>" +
      '<div>' + icon("users") + "<p><strong>Väikesed õppegrupid</strong><span>Individuaalselt või kuni 4 õpilast</span></p></div>" +
      '<div>' + icon("book") + "<p><strong>Läbimõeldud õppekava</strong><span>MS LAB õpik ja tunnistus</span></p></div>" +
      '<div>' + icon("heart") + "<p><strong>Personaalne juhendamine</strong><span>Tugi ka pärast koolitust</span></p></div>" +
      "</div>" +
      '<div class="btn-row" style="margin-top:32px"><a class="btn btn--outline" href="#/koolitused">' + t("choose") + "</a></div>" +
      "</div></div></section>" +
      /* Praktika teaser */
      '<section class="section" aria-labelledby="p-h"><div class="container praktika-teaser">' +
      '<div><span class="eyebrow">Praktika</span><h2 class="title" id="p-h">' + t("practice") + '</h2><p class="lead">Modellid leiame meie, vahendid on kohapeal. Sina keskendud tehnikale — koolitaja jälgib kogu tööprotsessi ja täidab sinu praktikaprotokolli.</p><div class="btn-row" style="margin-top:28px"><a class="btn btn--primary" href="#/praktika">Tutvu praktikaga ' + icon("arrow") + "</a></div></div>" +
      '<div class="pkg-grid">' + pkgCard("MINI", 2, 100, false, true) + pkgCard("MAXI", 4, 150, true, true) + "</div>" +
      "</div></section>" +
      /* Reviews */
      '<section class="section section--panel" aria-labelledby="r-h"><div class="container">' +
      '<div class="section-head"><div><span class="eyebrow">' + t("reviews") + '</span><h2 class="title" id="r-h">Mida ütlevad <em>õpilased</em></h2></div>' + sample() + "</div>" +
      '<div class="reviews">' + reviews.map(function (r) {
        return '<figure class="review" style="margin:0"><div class="stars" aria-label="5 tärni">' + icon("star") + icon("star") + icon("star") + icon("star") + icon("star") + '</div><blockquote>„' + r[2] + '“</blockquote><footer><span class="avatar" aria-hidden="true">' + r[0][0] + "</span><figcaption><strong>" + r[0] + "</strong><span>" + r[1] + "</span></figcaption></footer></figure>";
      }).join("") + "</div></div></section>" +
      /* News */
      '<section class="section" id="uudised" aria-labelledby="n-h"><div class="container">' +
      '<div class="section-head"><div><span class="eyebrow">Uudised</span><h2 class="title" id="n-h">' + t("news") + '</h2></div><div class="carousel-nav"><button type="button" class="icon-btn" data-car="-1" aria-label="Eelmised uudised">' + icon("chevL") + '</button><button type="button" class="icon-btn" data-car="1" aria-label="Järgmised uudised">' + icon("chevR") + "</button></div></div>" +
      '<div class="carousel"><div class="carousel-track" data-track tabindex="0" aria-label="Uudiste karussell" role="region">' + news.map(function (n) {
        return '<button type="button" class="news-card" data-news="' + n.id + '"><span class="media"><img src="assets/' + n.img + '" alt="" loading="lazy"></span><span class="body"><span class="meta"><span class="pill pill--tint">' + n.cat + "</span><span>" + n.date + '</span></span><h3>' + n.title + "</h3><p>" + n.ex + '</p><span class="more">' + t("more") + " " + icon("arrow") + "</span></span></button>";
      }).join("") + '</div><div class="carousel-progress" aria-hidden="true"><span data-car-progress></span></div></div>' +
      "</div></section>" +
      /* Newsletter */
      '<section class="section" style="padding-top:0"><div class="container"><div class="newsletter">' +
      '<div><span class="eyebrow">Uudiskiri</span><h2 class="title">' + t("newsletter") + "</h2></div>" +
      '<form class="nl-form" data-newsletter novalidate><label class="sr-only" for="nl-email">' + t("email") + '</label><div class="nl-row"><input id="nl-email" type="email" required autocomplete="email" placeholder="' + t("email") + '"><button class="btn btn--primary" type="submit">' + t("join") + '</button></div><p class="nl-note">Saadame kord kuus. Loobuda saad igal ajal. Prototüüp — andmeid ei salvestata.</p></form>' +
      "</div></div></section>" +
      "</div>";
  }

  function formatPanel(f) {
    return '<div class="format-panel">' +
      "<div><h3>" + f.title + '</h3><p class="def">' + f.def + '</p><div class="split-bars">' + f.bars.map(function (b) {
        return '<div class="split-bar"><span>' + b[0] + '</span><span class="track" role="img" aria-label="' + b[0] + " " + b[1] + '%"><span class="fill ' + (b[2] ? "fill--ink" : "") + '" style="width:' + b[1] + '%"></span></span></div>';
      }).join("") + '</div><div class="btn-row" style="margin-top:28px"><a class="btn btn--outline btn--sm" href="#/koolitused?format=' + f.key + '">Vaata ' + f.gen + " koolitusi " + icon("arrow") + "</a></div></div>" +
      '<dl class="facts">' + f.facts.map(function (x) { return "<div><dt>" + x[0] + "</dt><dd>" + x[1] + "</dd></div>"; }).join("") + "</dl>" +
      "</div>" + stepsHTML(f.steps);
  }

  function pkgCard(name, n, price, featured, compact) {
    var dots = ""; for (var i = 0; i < 4; i++) dots += '<i class="' + (i < n ? "on" : "") + '"></i>';
    var feats = featured
      ? ["4 modelli koolituskeskuse poolt", "Kõik töövahendid ja materjalid", "Täielik praktikaprotokoll", "Ettevalmistus tunnistuseks"]
      : ["2 modelli koolituskeskuse poolt", "Kõik töövahendid ja materjalid", "Koolitaja isiklik tagasiside"];
    return '<article class="pkg ' + (featured ? "pkg--featured" : "") + '">' +
      (featured ? '<span class="pill pill--tint">Enim valitud</span>' : "") +
      '<div class="pkg-name">' + name + "</div>" +
      '<div class="pkg-models"><span class="model-dots" aria-hidden="true">' + dots + "</span><span>" + n + " modelli</span></div>" +
      '<div class="pkg-price">' + price + " €<small>/ praktikapäev</small></div>" +
      (compact ? "" : '<ul class="pkg-feat">' + feats.map(function (x) { return "<li>" + icon("check") + x + "</li>"; }).join("") + "</ul>") +
      (compact ? '<a class="btn btn--sm ' + (featured ? "btn--primary" : "btn--outline") + '" href="#/praktika">Vaata paketti</a>'
        : '<button type="button" class="btn ' + (featured ? "btn--primary" : "btn--outline") + '" data-add-pkg="' + name + '" data-price="' + price + '">' + t("register") + "</button>") +
      "</article>";
  }

  /* ---------- Catalog */
  function viewCatalog() {
    var st = state.catalog;
    function cnt(k) { return courses.filter(function (c) { return k === "all" || FORMAT_BY_NAME[c.format] === k; }).length; }
    var fmtChips = [["all", "Kõik"], ["e", "E-õpe"], ["kontakt", "Kontaktõpe"], ["hybriid", "Hübriidõpe"]].map(function (x) {
      return '<button type="button" class="chip" aria-pressed="' + (st.format === x[0]) + '" data-cat-format="' + x[0] + '">' + x[1] + ' <span class="count">' + cnt(x[0]) + "</span></button>";
    }).join("");
    var lvlChips = [["all", "Kõik"], ["Baaskoolitus", "Baaskoolitus"], ["Täiendkoolitus", "Täiendkoolitus"]].map(function (x) {
      return '<button type="button" class="chip" aria-pressed="' + (st.level === x[0]) + '" data-cat-level="' + x[0] + '">' + x[1] + "</button>";
    }).join("");
    return '<div class="view">' +
      '<section class="page-head"><div class="container"><nav class="crumbs" aria-label="Asukoht"><a href="#/">Avaleht</a>' + icon("chevR") + '<span aria-current="page">Koolitused</span></nav>' +
      '<span class="eyebrow">Koolitused</span><h1 class="title">' + t("choose") + '</h1><p class="lead">Kulmu- ja ripsmekoolitused algajale ja meistrile — e-õppes, kohapeal või hübriidina. Iga koolitus lõpeb tunnistusega.</p></div></section>' +
      '<div class="container">' +
      '<div class="toolbar">' +
      '<div class="search-wrap"><div class="chip-label" id="s-lbl">Otsi</div><div class="search">' + icon("search") + '<input type="search" id="cat-q" aria-labelledby="s-lbl" placeholder="Otsi koolitust (ET / RU)…" value="' + esc(st.q) + '" autocomplete="off"></div></div>' +
      '<div class="filter-groups"><div><div class="chip-label">Õppevorm</div><div class="chips" role="group" aria-label="Õppevorm">' + fmtChips + '</div></div><div><div class="chip-label">Tase</div><div class="chips" role="group" aria-label="Tase">' + lvlChips + "</div></div></div>" +
      '<div class="result-count" data-result-count aria-live="polite"></div>' +
      "</div>" +
      '<div data-explainer></div>' +
      '<div data-course-grid></div>' +
      '<p style="margin:40px 0 0">' + sample() + "</p>" +
      "</div>" +
      '<div class="section" style="padding-bottom:88px"><div class="container"><div class="newsletter newsletter--cta"><div><span class="eyebrow">Ei leidnud sobivat?</span><h2 class="title">Küsi Marialt personaalset nõu</h2></div><div class="btn-row"><a class="btn btn--primary" href="mailto:info@mslab.ee">Kirjuta meile</a></div></div></div></div>' +
      "</div>";
  }
  function updateCatalog() {
    var st = state.catalog, q = norm(st.q.trim());
    var list = courses.filter(function (c) {
      return (st.format === "all" || FORMAT_BY_NAME[c.format] === st.format) &&
        (st.level === "all" || c.level === st.level) &&
        (!q || norm(c.title).indexOf(q) > -1 || norm(c.titleRu).indexOf(q) > -1);
    });
    var grid = document.querySelector("[data-course-grid]");
    if (!grid) return;
    grid.innerHTML = list.length ? '<div class="course-grid">' + list.map(function (c) { return courseCard(c); }).join("") + "</div>"
      : '<div class="empty"><strong>Ühtegi koolitust ei leitud</strong>Proovi teist otsingusõna või eemalda filtrid.<div class="btn-row" style="justify-content:center;margin-top:20px"><button type="button" class="btn btn--outline btn--sm" data-cat-reset>Tühjenda filtrid</button></div></div>';
    document.querySelector("[data-result-count]").textContent = list.length + (list.length === 1 ? " koolitus" : " koolitust");
    var ex = document.querySelector("[data-explainer]");
    if (st.format === "all") { ex.innerHTML = ""; }
    else {
      var f = FORMATS[st.format];
      ex.innerHTML = '<div class="explainer panel-steps"><div class="explainer-head"><div><span class="eyebrow eyebrow--rose">Õppevorm</span><h3 style="margin-top:10px">' + f.title + "</h3><p>" + f.def + '</p></div><a class="text-link" href="#/koolituskalender"><span>' + t("calendar") + "</span>" + icon("arrow") + "</a></div>" + stepsHTML(f.steps, "steps--compact") + "</div>";
    }
    document.querySelectorAll("[data-cat-format]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-cat-format") === st.format); });
    document.querySelectorAll("[data-cat-level]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-cat-level") === st.level); });
  }

  /* ---------- Course detail */
  function viewDetail(id) {
    var c = COURSE[id];
    if (!c) return viewNotFound();
    var sel = state.detailSel[id] || (state.detailSel[id] = { format: c.format, session: null });
    var ses = sessions.filter(function (s) { return s.course === id; });
    if (sel.session === null) { var firstOpen = ses.filter(function (s) { return s.tone !== "danger"; })[0]; sel.session = firstOpen ? sessions.indexOf(firstOpen) : -1; }
    var mods = MODULES[id] || MODULES.generic;
    var others = courses.filter(function (x) { return x.id !== id; }).slice(0, 3);
    return '<div class="view">' +
      '<section class="section" style="padding-top:32px"><div class="container">' +
      '<nav class="crumbs" aria-label="Asukoht"><a href="#/">Avaleht</a>' + icon("chevR") + '<a href="#/koolitused">Koolitused</a>' + icon("chevR") + '<span aria-current="page">' + esc(c.title) + "</span></nav>" +
      '<div class="detail-grid">' +
      '<div class="gallery"><div class="main">' + badgeHTML(c.badge) + '<img src="assets/' + c.image + '" alt="' + esc(c.title) + '" style="object-position:' + c.pos + '"></div>' +
      '<div class="thumb"><img src="assets/manual.jpg" alt="MS LAB õpik" loading="lazy"></div><div class="thumb"><img src="assets/certificate-hand.jpg" alt="MS LAB tunnistus" loading="lazy" style="object-position:50% 45%"></div><div class="thumb"><img src="assets/gift-bag.jpg" alt="MS LAB kingituskott" loading="lazy"></div></div>' +
      '<div class="detail-info">' +
      '<div class="tags" style="display:flex;flex-wrap:wrap;gap:6px"><span class="tag">' + c.level + '</span><span class="tag">' + c.lang + '</span><span class="tag">' + c.duration + "</span></div>" +
      "<h1>" + esc(ctitle(c)) + '</h1><p class="lead">' + c.lead + "</p>" +
      '<form data-detail-form="' + id + '">' +
      '<fieldset class="opt-group"><legend>Õppevorm ' + sample() + '</legend><div class="opt-list">' + c.options.map(function (o) {
        var k = FORMAT_BY_NAME[o[0]];
        return '<label class="opt"><input type="radio" name="fmt" value="' + o[0] + '"' + (sel.format === o[0] ? " checked" : "") + '><span class="radio" aria-hidden="true"></span><span><span class="o-title">' + o[0] + '</span><span class="o-sub">' + FORMATS[k].short + '</span></span><span class="o-price">' + eur(o[1]) + "</span></label>";
      }).join("") + "</div></fieldset>" +
      '<fieldset class="opt-group" data-date-group><legend>Kuupäev ja linn</legend>' + dateOptions(c, sel, ses) + "</fieldset>" +
      '<div class="buy-bar"><div class="total"><span>Hind</span><strong data-detail-total>' + eur(priceOf(c, sel.format)) + '</strong></div><button type="submit" class="btn btn--primary">' + icon("bag") + ' Lisa ostukorvi</button><a class="btn btn--ghost" href="mailto:info@mslab.ee">Küsi lisainfot</a></div>' +
      "</form>" +
      '<ul class="included">' + ["MS LAB õpik ja õppematerjalid", "Töövahendid ja materjalid koolituse ajaks", "Praktika modellidega (kontakt- ja hübriidõpe)", "Ligipääs e-õppe keskkonnale 6 kuud", "Tunnistus pärast koolituse lõpetamist", "Kingitus: MaxEyeLash seerum"].map(function (x) { return "<li>" + icon("check") + x + "</li>"; }).join("") + "</ul>" +
      "</div></div></div></section>" +
      '<section class="section section--panel"><div class="container program">' +
      '<div><span class="eyebrow">Õppekava</span><h2 class="title">Koolituse <em>programm</em></h2><p class="lead">Moodulid on üles ehitatud nii, et teooria valmistab sind ette praktikapäevaks. Iga mooduli lõpus on lühike kontrollküsimustik.</p>' +
      '<div class="kit"><img src="assets/gift-bag.jpg" alt="MS LAB kingituskott ja seerum" loading="lazy"><div><h3>Sinu kingitus</h3><p>Igale õpilasele MS LAB kott ja MaxEyeLash seerum — tule koolitusele, saa kingitus.</p></div></div></div>' +
      '<div class="modules">' + mods.map(function (m, i) {
        return '<details class="module"' + (i === 0 ? " open" : "") + '><summary><span class="m-num">0' + (i + 1) + '</span><span class="m-title">' + m[0] + '<span class="m-meta">' + m[1] + '</span></span><span class="plus" aria-hidden="true">' + icon("plus") + "</span></summary><ul>" + m[2].map(function (x) { return "<li>" + x + "</li>"; }).join("") + "</ul></details>";
      }).join("") + "</div>" +
      "</div></section>" +
      '<section class="section"><div class="container"><div class="section-head"><div><span class="eyebrow">Vaata ka</span><h2 class="title">Teised koolitused</h2></div><a class="text-link" href="#/koolitused"><span>Kõik koolitused</span>' + icon("arrow") + "</a></div>" +
      '<div class="course-grid" style="margin-top:0">' + others.map(function (x) { return courseCard(x); }).join("") + "</div></div></section>" +
      "</div>";
  }
  function priceOf(c, fmt) { var o = c.options.filter(function (x) { return x[0] === fmt; })[0]; return o ? o[1] : c.price; }
  function dateOptions(c, sel, ses) {
    if (sel.format === "E-õpe") {
      return '<div class="opt-list"><label class="opt"><input type="radio" name="ses" value="-1" checked><span class="radio" aria-hidden="true"></span><span><span class="o-title">Alusta kohe</span><span class="o-sub">Veebis · ligipääs 6 kuud</span></span><span class="pill pill--success"><span class="dot"></span>Avatud</span></label></div>';
    }
    if (!ses.length) return '<p class="muted small">Uued kuupäevad lisanduvad peagi.</p>';
    return '<div class="opt-list">' + ses.map(function (s) {
      var idx = sessions.indexOf(s), full = s.tone === "danger";
      return '<label class="opt"><input type="radio" name="ses" value="' + idx + '"' + (sel.session === idx ? " checked" : "") + (full ? " disabled" : "") + '><span class="radio" aria-hidden="true"></span><span><span class="o-title">' + fDate(s.date) + '</span><span class="o-sub"><span class="city">' + s.city + "</span><span class='sep-dot'></span>" + s.format + "<span class='sep-dot'></span>" + s.language + '</span></span><span class="pill pill--' + s.tone + '"><span class="dot"></span>' + s.status + "</span></label>";
    }).join("") + "</div>";
  }

  /* ---------- Calendar */
  function viewCalendar() {
    var cityChips = ["all"].concat(CITIES).map(function (x) {
      var n = x === "all" ? sessions.length : sessions.filter(function (s) { return s.city === x; }).length;
      return '<button type="button" class="chip" aria-pressed="' + (state.calCity === x) + '" data-cal-city="' + x + '">' + (x === "all" ? "Kõik linnad" : icon("pin") + x) + ' <span class="count">' + n + "</span></button>";
    }).join("");
    var fmtChips = [["all", "Kõik"], ["Kontaktõpe", "Kontaktõpe"], ["Hübriidõpe", "Hübriidõpe"]].map(function (x) {
      return '<button type="button" class="chip" aria-pressed="' + (state.calFormat === x[0]) + '" data-cal-format="' + x[0] + '">' + x[1] + "</button>";
    }).join("");
    return '<div class="view">' +
      '<section class="page-head"><div class="container"><nav class="crumbs" aria-label="Asukoht"><a href="#/">Avaleht</a>' + icon("chevR") + '<span aria-current="page">Koolituskalender</span></nav>' +
      '<span class="eyebrow">Koolituskalender</span><h1 class="title">Tulevased <em>koolitused</em></h1><p class="lead">Kontakt- ja hübriidõppe praktikapäevad linnade kaupa. E-õppega saad alustada igal ajal.</p></div></section>' +
      '<div class="container">' +
      '<div class="cal-filters"><div><div class="chip-label">Linn</div><div class="chips" role="group" aria-label="Linn">' + cityChips + '</div></div><div><div class="chip-label">Õppevorm</div><div class="chips" role="group" aria-label="Õppevorm">' + fmtChips + "</div></div></div>" +
      '<div data-cal-list></div>' +
      '<div class="legend"><span class="pill pill--success"><span class="dot"></span>3 kohta</span><span class="pill pill--success"><span class="dot"></span>Avatud</span><span class="pill pill--warning"><span class="dot"></span>Viimased kohad</span><span class="pill pill--danger"><span class="dot"></span>Täis</span>' + sample() + "</div>" +
      "</div>" +
      '<div class="section"><div class="container"><div class="newsletter newsletter--cta" style="background:var(--panel);border:1px solid var(--border)"><div><span class="eyebrow">E-õpe</span><h2 class="title">Ei sobi ükski kuupäev?</h2><p class="lead">E-õppe koolitustega saad alustada kohe ja praktikapäeva valida hiljem.</p></div><div class="btn-row"><a class="btn btn--primary" href="#/koolitused?format=e">Vaata e-õppe koolitusi ' + icon("arrow") + "</a></div></div></div></div>" +
      "</div>";
  }
  function updateCalendar() {
    var list = sessions.filter(function (s) { return (state.calCity === "all" || s.city === state.calCity) && (state.calFormat === "all" || s.format === state.calFormat); });
    var out = "", lastM = "";
    if (!list.length) out = '<div class="empty"><strong>Selles linnas praegu koolitusi pole</strong>Vali teine linn või vaata e-õppe koolitusi.</div>';
    else {
      out += '<div class="cal-list" style="border-top:0">';
      out += '<div class="cal-head" aria-hidden="true"><span>Kuupäev</span><span>Koolitus</span><span>Linn</span><span>Keel · staatus</span><span></span></div>';
      list.forEach(function (s) {
        var d = pd(s.date), m = MONTHS[d.getMonth()] + " " + d.getFullYear();
        if (m !== lastM) { var n = list.filter(function (x) { var dd = pd(x.date); return MONTHS[dd.getMonth()] + " " + dd.getFullYear() === m; }).length; out += '<h2 class="cal-month">' + m.charAt(0).toUpperCase() + m.slice(1) + "<span>" + n + (n === 1 ? " koolitus" : " koolitust") + "</span></h2>"; lastM = m; }
        var c = COURSE[s.course], full = s.tone === "danger";
        out += '<div class="cal-row">' +
          '<div class="cal-date"><strong>' + d.getDate() + "</strong><span>" + MON_S[d.getMonth()] + " · " + WD[d.getDay()] + "</span></div>" +
          '<div class="cal-row-top"><span class="cal-city">' + icon("pin") + s.city + '</span></div>' +
          '<div class="cal-course"><a href="#/koolitus/' + c.id + '">' + esc(c.title) + '</a><div class="sub">' + s.format + " · " + c.level + "</div></div>" +
          '<div class="cal-meta"><span class="cal-lang" title="Õppekeel">' + s.language + '</span><span class="pill pill--' + s.tone + ' cal-status"><span class="dot"></span>' + s.status + "</span></div>" +
          '<div class="cal-action">' + (full ? '<button type="button" class="btn btn--ghost btn--sm" data-waitlist>Ootenimekiri</button>' : '<a class="btn btn--outline btn--sm" href="#/koolitus/' + c.id + '">' + t("register") + " " + icon("arrow") + "</a>") + "</div>" +
          "</div>";
      });
      out += "</div>";
    }
    document.querySelector("[data-cal-list]").innerHTML = out;
    document.querySelectorAll("[data-cal-city]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-cal-city") === state.calCity); });
    document.querySelectorAll("[data-cal-format]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-cal-format") === state.calFormat); });
  }

  /* ---------- Praktika */
  function viewPraktika() {
    return '<div class="view">' +
      '<section class="section" style="padding-top:40px"><div class="container">' +
      '<nav class="crumbs" aria-label="Asukoht"><a href="#/">Avaleht</a>' + icon("chevR") + '<span aria-current="page">Praktika</span></nav>' +
      '<div class="p-hero"><div><span class="eyebrow">Praktika</span><h1 class="title" style="font-size:clamp(44px,5vw,64px)">' + t("practice") + '</h1><p class="lead">Kindlus tuleb tegemisest. Praktikapäeval töötad päris modellidega koolitaja juhendamisel — nii baaskoolituse osana kui ka lisapraktikana pärast koolitust.</p><div class="btn-row" style="margin-top:32px"><a class="btn btn--primary" href="#paketid">Vali pakett ' + icon("arrow") + '</a><a class="btn btn--outline" href="#/koolituskalender">' + t("calendar") + "</a></div></div>" +
      '<div class="p-hero-img"><img src="assets/maria-portrait.jpg" alt="Koolitaja Maria Sosnina" width="853" height="1140"></div></div>' +
      "</div></section>" +
      '<section class="section" style="padding-top:0"><div class="container"><div class="concept">' +
      '<div><span class="eyebrow eyebrow--rose">Kuidas praktika toimub</span><blockquote style="margin-top:20px">Praktika toimub koolitaja juhendamisel. Õpilasele leiab koolituskeskus vajalikud modellid ning tagab kõik tööks vajalikud vahendid. Koolitaja jälgib kogu tööprotsessi, annab jooksvalt juhiseid, näpunäiteid ja tagasisidet.</blockquote></div>' +
      '<div class="concept-feats">' +
      "<div>" + icon("users") + "<p><strong>Modellid leiame meie</strong><span>Sa ei pea ise modelle otsima</span></p></div>" +
      "<div>" + icon("tools") + "<p><strong>Kõik vahendid kohapeal</strong><span>Värvid, tööriistad ja ühekordsed vahendid</span></p></div>" +
      "<div>" + icon("eye") + "<p><strong>Koolitaja jälgib protsessi</strong><span>Juhised ja näpunäited jooksvalt</span></p></div>" +
      "</div></div></div></section>" +
      '<section class="section section--panel"><div class="container protocol-grid">' +
      '<div><span class="eyebrow">Praktikaprotokoll</span><h2 class="title">Tagasiside, mis jääb <em>sinuga</em></h2><p class="lead">Praktikapäeva jooksul täidab koolitaja sinu praktikaprotokolli. Pärast praktikat saad selle endale — nii tead täpselt, kus sa oled ja kuhu edasi liikuda.</p>' +
      '<ol class="protocol-steps"><li><span>01</span><span>Koolitaja jälgib iga töö etappi ja teeb märkmeid</span></li><li><span>02</span><span>Protokolli kirjutatakse, mis õnnestus hästi, millele tähelepanu pöörata ja mida arendada</span></li><li><span>03</span><span>Pärast praktikat saad protokolli oma õpilase kontole</span></li></ol></div>' +
      '<div class="doc" aria-label="Praktikaprotokolli näidis"><div class="doc-head"><strong>Praktikaprotokoll</strong>' + sample() + '</div>' +
      '<dl class="doc-meta"><div><dt>Õpilane</dt><dd>Liis</dd></div><div><dt>Koolitus</dt><dd>Kulmud, baas</dd></div><div><dt>Kuupäev</dt><dd>18.10.2026</dd></div><div><dt>Modelle</dt><dd>4 (MAXI)</dd></div></dl>' +
      '<div class="doc-body">' +
      '<div class="doc-sec"><h4><i style="background:var(--success)"></i>Mis õnnestus hästi</h4><p>Kulmukuju modelleerimine on sümmeetriline ja sobib näokujuga. Töökoht korras, hügieen laitmatu.</p></div>' +
      '<div class="doc-sec"><h4><i style="background:var(--rose)"></i>Millele tähelepanu pöörata</h4><p>Värvi hoideaeg heledama naha puhul — jälgi tooni kujunemist pidevalt.</p></div>' +
      '<div class="doc-sec"><h4><i style="background:var(--foreground)"></i>Mida arendada</h4><p>Harjuta pintsetiga korrigeerimist kulmu sabaosas; eesmärk — kiirem ja kindlam käsi.</p></div>' +
      '</div><div class="doc-sign"><span>Koolitaja</span><span class="sig">Maria Sosnina</span></div></div>' +
      "</div></section>" +
      '<section class="section" id="paketid"><div class="container">' +
      '<div class="section-head"><div><span class="eyebrow">Paketid</span><h2 class="title">MINI või <em>MAXI</em></h2><p class="lead">Lisapraktika pärast koolitust või baaskoolituse kõrvale. Mõlemas paketis on modellid ja vahendid hinna sees.</p></div>' + sample() + "</div>" +
      '<div class="pkg-grid" style="max-width:880px">' + pkgCard("MINI", 2, 100, false, false) + pkgCard("MAXI", 4, 150, true, false) + "</div>" +
      "</div></section>" +
      "</div>";
  }

  /* ---------- Õppimine */
  function viewPortal() {
    var e = enrolled[state.portalIdx], c = COURSE[e.id];
    var lessons = LESSONS[e.id], done = Math.round(lessons.length * e.progress / 100);
    return '<div class="view"><div class="container">' +
      '<div class="portal-head"><div><span class="eyebrow">Õppimine</span><h1>Tere, <em>Liis</em></h1></div><span class="session-guard"><i aria-hidden="true"></i>Aktiivne seanss: see seade · 1/1</span></div>' +
      '<div class="course-switch" role="tablist" aria-label="Minu koolitused">' + enrolled.map(function (x, i) {
        var cc = COURSE[x.id];
        return '<button type="button" role="tab" aria-selected="' + (i === state.portalIdx) + '" data-portal="' + i + '"><strong>' + esc(cc.title) + "</strong><span>" + x.format + " · " + x.progress + '%</span><span class="mini-track"><b style="width:' + x.progress + '%"></b></span></button>';
      }).join("") + "</div>" +
      '<div class="progress-card" role="tabpanel"><div><span class="xs muted">' + e.format + " · " + c.level + "</span><h2>" + esc(c.title) + '</h2><div class="progress-row"><span class="track" role="progressbar" aria-valuenow="' + e.progress + '" aria-valuemin="0" aria-valuemax="100" aria-label="Edenemine"><b style="width:' + e.progress + '%"></b></span><strong>' + e.progress + '%</strong></div><p class="small muted" style="margin-top:10px">' + done + " / " + lessons.length + " tundi läbitud · Ligipääs kuni <strong style='color:var(--foreground)'>" + e.access + "</strong></p></div>" +
      '<div class="btn-row">' + (e.progress >= 100 ? '<button type="button" class="btn btn--outline" data-toast-msg="Tunnistuse PDF — prototüübis allalaadimine puudub">' + icon("award") + " Laadi tunnistus</button>" : '<button type="button" class="btn btn--primary" data-toast-msg="Tunnimängija avaneb päris rakenduses (/oppimine/tund)">' + icon("play") + " Jätka õppimist</button>") + "</div></div>" +
      '<div class="quick-cards">' +
      qcard("cal", "Järgmine kontaktpäev", e.next[0], (e.next[1] !== "Veebis" ? '<span class="city">' + e.next[1] + "</span> · " : "") + e.next[2]) +
      qcard("wallet", "Tasumata summa", e.balance[0], e.balance[1]) +
      qcard("award", "Tunnistus", e.cert[0], e.cert[1]) +
      qcard("clip", "Praktika", e.practice[0], e.practice[1]) +
      "</div>" +
      '<div class="portal-body">' +
      '<div class="lessons"><div class="lessons-head"><h3>Tunnid</h3>' + sample() + "</div>" + lessons.map(function (l, i) {
        var cls = i < done ? "done" : i === done ? "current" : "locked";
        var ic = cls === "done" ? "check" : cls === "current" ? "play" : "lock";
        return '<div class="lesson ' + cls + '"><span class="st" aria-hidden="true">' + icon(ic) + '</span><div><div class="l-title">' + (i + 1) + ". " + l + '</div><div class="l-meta">' + (cls === "done" ? "Läbitud" : cls === "current" ? "Pooleli · video " + (12 + i * 3) + " min" : "Avaneb eelmise järel") + "</div></div>" +
          (cls === "current" ? '<button type="button" class="btn btn--primary btn--sm" data-toast-msg="Tunnimängija avaneb päris rakenduses">Jätka</button>' : '<span class="l-go muted">' + (8 + i * 4) + " min</span>") + "</div>";
      }).join("") + "</div>" +
      '<div class="side-stack">' +
      '<div class="side-card"><h3>Tunnistus</h3><div class="cert-thumb"><img src="assets/certificate.jpg" alt="MS LAB tunnistuse näidis" loading="lazy"><p class="small muted">' + e.cert[1] + ". Tunnistus väljastatakse pärast teooria ja praktika läbimist.</p></div></div>" +
      '<div class="side-card"><h3>Õppematerjalid</h3><ul class="included" style="margin-top:0">' + ["MS LAB õpik (PDF)", "Kontrollnimekiri praktikapäevaks", "Hinnakirja mall"].map(function (x) { return "<li>" + icon("book") + x + "</li>"; }).join("") + "</ul></div>" +
      '<div class="side-card" style="background:var(--panel)"><h3>Küsimus koolitajale?</h3><p class="small muted">Maria vastab tavaliselt ühe tööpäeva jooksul.</p><a class="btn btn--outline btn--sm" style="margin-top:14px" href="mailto:info@mslab.ee">Kirjuta</a></div>' +
      "</div></div>" +
      '<div style="height:80px"></div></div></div>';
  }
  function qcard(ic, k, v, s) { return '<div class="qcard"><span class="ic" aria-hidden="true">' + icon(ic) + '</span><span class="k">' + k + '</span><span class="v">' + v + '</span><span class="s">' + s + "</span></div>"; }

  /* ---------- Admin */
  function viewAdmin() {
    if (!state.admin) { var c0 = courses[0]; state.admin = { id: c0.id, label: c0.badge ? c0.badge.label : "", tone: c0.badge ? c0.badge.tone : "rose", show: !!c0.badge }; }
    var a = state.admin;
    return '<div class="view"><div class="container admin-shell">' +
      '<aside class="admin-side"><nav aria-label="Admin">' +
      '<span class="nav-i">' + icon("grid") + "Töölaud</span>" +
      '<a href="#/koolitused">' + icon("book") + "Koolitused</a>" +
      '<a href="#/koolituskalender">' + icon("cal") + "Kalender</a>" +
      '<span class="nav-i active" aria-current="page">' + icon("tag") + "Märgised</span>" +
      '<span class="nav-i">' + icon("users") + "Õpilased</span>" +
      "</nav></aside>" +
      '<div class="admin-main">' +
      '<span class="eyebrow">Admin</span><h1 class="title" style="margin-top:12px">Koolituste <em>märgised</em></h1><p class="lead">Lisa, muuda ja eelvaata kursusekaardi märgist enne salvestamist. Muudatus kajastub kohe koolituste kataloogis.</p>' +
      '<div class="stats"><div class="stat"><span>Aktiivsed koolitused</span><strong>' + courses.length + '</strong></div><div class="stat"><span>Registreerimisi (okt)</span><strong>38</strong></div><div class="stat"><span>Tulevased sessioonid</span><strong>' + sessions.length + '</strong></div><div class="stat"><span>Täis sessioone</span><strong>1</strong></div></div>' +
      '<p style="margin-top:12px">' + sample() + "</p>" +
      '<div class="editor">' +
      '<form class="editor-form" data-badge-form novalidate><h2>Märgise redaktor</h2>' +
      '<div class="field"><label for="b-course">Koolitus</label><select class="select" id="b-course">' + courses.map(function (c) { return '<option value="' + c.id + '"' + (c.id === a.id ? " selected" : "") + ">" + esc(c.title) + "</option>"; }).join("") + "</select></div>" +
      '<label class="switch"><input type="checkbox" id="b-show"' + (a.show ? " checked" : "") + '><span class="tr" aria-hidden="true"></span>Näita märgist kaardil</label>' +
      '<div class="field"><label for="b-label">Märgise tekst</label><input class="input" id="b-label" maxlength="18" value="' + esc(a.label) + '" placeholder="nt Bestseller"><span class="hint">Kuni 18 tähemärki. Kiirvalik:</span><div class="chips">' + ["Bestseller", "Uus", "Populaarne", "Soodus", "Viimased kohad"].map(function (p) { return '<button type="button" class="chip" data-preset="' + p + '">' + p + "</button>"; }).join("") + "</div></div>" +
      '<fieldset class="field"><legend class="lbl" style="margin-bottom:8px">Toon</legend><div class="tone-opts"><label class="tone-opt"><input type="radio" name="tone" value="rose"' + (a.tone === "rose" ? " checked" : "") + '><span class="sw" style="background:var(--rose)"></span>Rose</label><label class="tone-opt"><input type="radio" name="tone" value="ink"' + (a.tone === "ink" ? " checked" : "") + '><span class="sw" style="background:var(--primary)"></span>Ink</label></div></fieldset>' +
      '<div class="btn-row"><button type="submit" class="btn btn--primary">Salvesta</button><button type="button" class="btn btn--ghost" data-badge-reset>Taasta</button></div>' +
      "</form>" +
      '<div class="preview-wrap"><div class="preview-label"><span class="eyebrow">Eelvaade</span><span class="pill pill--outline">Live</span></div><div data-badge-preview></div></div>' +
      "</div>" +
      '<h2 class="title" style="font-size:28px;margin-top:56px">Kõik koolitused</h2><div class="table-wrap"><table class="admin-table"><thead><tr><th>Koolitus</th><th class="hide-sm">Vorm</th><th>Märgis</th><th class="hide-sm">Hind</th></tr></thead><tbody data-admin-rows></tbody></table></div>' +
      "</div></div></div>";
  }
  function updateAdminPreview() {
    var a = state.admin, c = COURSE[a.id];
    var draft = Object.assign({}, c, { badge: a.show && a.label.trim() ? { label: a.label.trim(), tone: a.tone } : null });
    var p = document.querySelector("[data-badge-preview]");
    if (p) p.innerHTML = courseCard(draft, { preview: true });
    var rows = document.querySelector("[data-admin-rows]");
    if (rows) rows.innerHTML = courses.map(function (x) {
      return "<tr><td>" + esc(x.title) + '</td><td class="hide-sm">' + x.format + "</td><td>" + (x.badge ? badgeHTML(x.badge).replace(" badge", "") : '<span class="muted small">—</span>') + '</td><td class="hide-sm">' + eur(x.price) + "</td></tr>";
    }).join("");
  }

  function viewNotFound() {
    return '<div class="view"><section class="section"><div class="container" style="text-align:center"><img src="assets/flower.jpg" alt="" style="width:120px;height:160px;object-fit:cover;border-radius:12px;margin:0 auto 28px"><span class="eyebrow">404</span><h1 class="title">Lehte ei leitud</h1><p class="lead" style="margin-inline:auto">Seda lehte ei ole olemas või see on liikunud.</p><div class="btn-row" style="justify-content:center;margin-top:28px"><a class="btn btn--primary" href="#/">Avalehele</a></div></div></section></div>';
  }

  /* ------------------------------------------------------------------ Shell: nav, cart, toast, dialog */
  var NAV_HREF = ["#/koolitused", "#/koolituskalender", "#/praktika", "#/koolitaja", "#/uudised"];
  function renderNav(route) {
    var labels = t("nav");
    var cur = { koolitused: 0, koolitus: 0, koolituskalender: 1, praktika: 2, koolitaja: 3, uudised: 4 }[route];
    document.getElementById("nav-list").innerHTML = labels.map(function (l, i) {
      return '<li><a href="' + NAV_HREF[i] + '"' + (cur === i ? ' aria-current="page"' : "") + ">" + l + "</a></li>";
    }).join("");
    document.getElementById("mobile-nav").innerHTML = labels.map(function (l, i) {
      return '<a href="' + NAV_HREF[i] + '"' + (cur === i ? ' aria-current="page"' : "") + ">" + l + icon("arrow") + "</a>";
    }).join("") + '<a href="#/oppimine">Õppimine' + icon("arrow") + "</a>";
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-lang]").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lang") === state.lang); });
    document.documentElement.lang = state.lang;
    document.querySelector(".cart-btn").setAttribute("aria-label", t("cart") + " (" + state.cart.length + ")");
  }

  function renderCart() {
    var n = state.cart.length, el = document.querySelector("[data-cart-count]");
    el.textContent = n; if (n) el.removeAttribute("data-zero"); else el.setAttribute("data-zero", "");
    document.querySelector(".cart-btn").setAttribute("aria-label", t("cart") + " (" + n + ")");
    var body = document.querySelector("[data-cart-body]"), foot = document.querySelector("[data-cart-foot]");
    if (!n) {
      body.innerHTML = '<div class="empty" style="margin-top:16px"><strong>Ostukorv on tühi</strong>Vali endale sobiv koolitus.</div>';
      foot.innerHTML = '<a class="btn btn--primary btn--block" href="#/koolitused" data-close-cart>' + t("cta") + "</a>";
      return;
    }
    var total = 0;
    body.innerHTML = state.cart.map(function (it, i) {
      total += it.price;
      return '<div class="cart-item"><img src="assets/' + it.image + '" alt=""><div><strong>' + esc(it.title) + "</strong><span>" + it.meta + '</span><div class="price" style="font-size:18px;margin-top:6px">' + eur(it.price) + '</div></div><button type="button" class="icon-btn" data-remove="' + i + '" aria-label="Eemalda ' + esc(it.title) + '">' + icon("trash") + "</button></div>";
    }).join("");
    foot.innerHTML = '<div class="cart-total"><span class="muted small">Kokku</span><strong>' + eur(total) + '</strong></div><button type="button" class="btn btn--primary btn--block" data-checkout>Vormista ost</button><p class="xs muted" style="text-align:center">' + t("sample") + " · makse (Montonio) lisandub päris rakenduses</p>";
  }
  var lastFocus = null;
  function openCart() {
    lastFocus = document.activeElement;
    document.getElementById("cart-drawer").setAttribute("data-open", ""); document.getElementById("cart-drawer").setAttribute("aria-hidden", "false");
    document.querySelector("[data-scrim]").setAttribute("data-open", "");
    setTimeout(function () { var b = document.querySelector("#cart-drawer [data-close-cart]"); if (b) b.focus(); }, 60);
  }
  function closeCart() {
    var d = document.getElementById("cart-drawer");
    if (!d.hasAttribute("data-open")) return;
    d.removeAttribute("data-open"); d.setAttribute("aria-hidden", "true");
    document.querySelector("[data-scrim]").removeAttribute("data-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function addToCart(item) { state.cart.push(item); renderCart(); toast(item.title + " lisati ostukorvi"); }

  var toastTimer;
  function toast(msg) {
    var el = document.querySelector("[data-toast]");
    el.innerHTML = icon("check") + "<span>" + esc(msg) + "</span>";
    el.setAttribute("data-show", "");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.removeAttribute("data-show"); }, 2800);
  }

  function openArticle(id) {
    var n = news.filter(function (x) { return x.id === id; })[0]; if (!n) return;
    var d = document.getElementById("article-dialog");
    d.innerHTML = '<button type="button" class="icon-btn article-close" data-close-article aria-label="Sulge">' + icon("x") + '</button><div class="article-media"><img src="assets/' + n.img + '" alt=""></div><div class="article-body"><span class="eyebrow">' + n.cat + " · " + n.date + '</span><h2 id="article-title">' + n.title + "</h2>" + n.body.map(function (p) { return "<p>" + p + "</p>"; }).join("") + '<div class="btn-row" style="margin-top:24px"><button type="button" class="btn btn--outline btn--sm" data-close-article>Sulge</button>' + sample() + "</div></div>";
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
  }

  /* ------------------------------------------------------------------ Campaign popup */
  // Rules: at most once per session, never in checkout/lessons/tests,
  // Esc + backdrop close, focus trapped (native <dialog>).
  var campTimer = null;
  function openCampaign() {
    var d = document.getElementById("campaign-dialog");
    if (d.open) return;
    if (d.showModal) d.showModal(); else d.setAttribute("open", "");
  }
  function closeCampaign() { var d = document.getElementById("campaign-dialog"); if (d && d.open) d.close(); }
  window.openCampaign = openCampaign;
  (function () {
    var d = document.getElementById("campaign-dialog");
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-close-campaign]")) closeCampaign(); });
  })();
  function maybeAutoCampaign(name) {
    clearTimeout(campTimer);
    if (name !== "") return;
    var seen = false;
    try { seen = sessionStorage.getItem("mslab-c-camp") === "1"; } catch (e) {}
    if (seen) return;
    campTimer = setTimeout(function () { try { sessionStorage.setItem("mslab-c-camp", "1"); } catch (e) {} if (!parse().parts[0]) openCampaign(); }, 6000);
  }

  /* ------------------------------------------------------------------ Carousel */
  function initCarousel() {
    var tr = document.querySelector("[data-track]"); if (!tr) return;
    var prog = document.querySelector("[data-car-progress]");
    function upd() {
      var max = tr.scrollWidth - tr.clientWidth, p = max > 0 ? tr.scrollLeft / max : 0, vis = tr.clientWidth / tr.scrollWidth;
      prog.style.width = (vis * 100) + "%";
      prog.style.transform = "translateX(" + (p * (1 / vis - 1) * 100) + "%)";
      document.querySelectorAll("[data-car]").forEach(function (b) {
        var dir = +b.getAttribute("data-car");
        b.disabled = dir < 0 ? tr.scrollLeft <= 2 : tr.scrollLeft >= max - 2;
      });
    }
    tr.addEventListener("scroll", upd, { passive: true });
    window.addEventListener("resize", upd);
    upd();
  }

  /* ------------------------------------------------------------------ Router */
  function parse() {
    var h = location.hash.replace(/^#/, "") || "/";
    var qi = h.indexOf("?"), q = {};
    if (qi > -1) { h.slice(qi + 1).split("&").forEach(function (kv) { var p = kv.split("="); q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ""); }); h = h.slice(0, qi); }
    var parts = h.split("/").filter(Boolean);
    return { parts: parts, q: q };
  }
  var lastRouteKey = null;
  function render() {
    var r = parse(), p = r.parts, name = p[0] || "", html, after;
    var main = document.getElementById("main");
    closeMenu(); closeCart();
    var d = document.getElementById("article-dialog"); if (d.open) d.close();
    closeCampaign(); maybeAutoCampaign(name);
    switch (name) {
      case "": case "koolitaja": case "uudised":
        html = viewHome(); after = initCarousel; break;
      case "koolitused":
        if (r.q.format && FORMATS[r.q.format]) state.catalog.format = r.q.format;
        html = viewCatalog(); after = updateCatalog; break;
      case "koolitus": html = viewDetail(p[1]); break;
      case "koolituskalender":
        if (r.q.city && CITIES.indexOf(r.q.city) > -1) state.calCity = r.q.city;
        html = viewCalendar(); after = updateCalendar; break;
      case "praktika": html = viewPraktika(); break;
      case "oppimine": html = viewPortal(); break;
      case "admin": html = viewAdmin(); after = updateAdminPreview; break;
      default: html = viewNotFound();
    }
    main.innerHTML = html;
    renderNav(name);
    if (after) after();
    var titles = { "": "Avaleht", koolitaja: "Koolitaja", uudised: "Uudised", koolitused: "Koolitused", koolitus: p[1] && COURSE[p[1]] ? COURSE[p[1]].title : "Koolitus", koolituskalender: "Koolituskalender", praktika: "Praktika", oppimine: "Õppimine", admin: "Admin" };
    document.title = (titles[name] || "Lehte ei leitud") + " — MS LAB Koolituskeskus";
    var key = location.hash;
    if (name === "koolitaja" || name === "uudised") {
      var target = document.getElementById(name);
      if (target) requestAnimationFrame(function () { target.scrollIntoView({ block: "start" }); });
    } else if (key !== lastRouteKey) {
      window.scrollTo(0, 0);
    }
    if (lastRouteKey !== null) main.focus({ preventScroll: true });
    lastRouteKey = key;
  }

  /* ------------------------------------------------------------------ Mobile menu */
  var burger = document.querySelector(".burger"), menu = document.getElementById("mobile-menu");
  function closeMenu() { menu.removeAttribute("data-open"); burger.setAttribute("aria-expanded", "false"); burger.setAttribute("aria-label", "Ava menüü"); document.body.removeAttribute("data-menu-open"); }
  burger.addEventListener("click", function () {
    var open = !menu.hasAttribute("data-open");
    if (open) { menu.setAttribute("data-open", ""); document.body.setAttribute("data-menu-open", ""); burger.setAttribute("aria-label", "Sulge menüü"); burger.innerHTML = icon("x"); }
    else { closeMenu(); }
    if (!open) burger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg>';
    burger.setAttribute("aria-expanded", String(open));
  });
  var _closeMenu = closeMenu;
  closeMenu = function () { var was = menu.hasAttribute("data-open"); _closeMenu(); if (was) burger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg>'; };
  window.addEventListener("resize", function () { if (window.innerWidth >= 1024) closeMenu(); });

  /* ------------------------------------------------------------------ Events (delegated) */
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-lang],[data-open-cart],[data-close-cart],[data-scrim],[data-remove],[data-checkout],[data-home-tab],[data-cat-format],[data-cat-level],[data-cat-reset],[data-cal-city],[data-cal-format],[data-waitlist],[data-news],[data-close-article],[data-car],[data-portal],[data-preset],[data-badge-reset],[data-add-pkg],[data-toast-msg]");
    if (!el) {
      var dlg = document.getElementById("article-dialog");
      if (e.target === dlg) dlg.close();
      return;
    }
    if (el.hasAttribute("data-lang")) { state.lang = el.getAttribute("data-lang"); render(); return; }
    if (el.hasAttribute("data-open-cart")) { openCart(); return; }
    if (el.hasAttribute("data-close-cart") || el.hasAttribute("data-scrim")) { closeCart(); return; }
    if (el.hasAttribute("data-remove")) { state.cart.splice(+el.getAttribute("data-remove"), 1); renderCart(); var nb = document.querySelector("#cart-drawer [data-close-cart]"); if (nb) nb.focus(); return; }
    if (el.hasAttribute("data-checkout")) { toast("Prototüüp: makse lisandub päris rakenduses"); return; }
    if (el.hasAttribute("data-home-tab")) {
      state.homeTab = el.getAttribute("data-home-tab");
      document.querySelectorAll("[data-home-tab]").forEach(function (b) { var on = b === el; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
      var pnl = document.getElementById("fmt-panel"); pnl.setAttribute("aria-labelledby", "tab-" + state.homeTab); pnl.innerHTML = formatPanel(FORMATS[state.homeTab]);
      return;
    }
    if (el.hasAttribute("data-cat-format")) { state.catalog.format = el.getAttribute("data-cat-format"); if (location.hash.indexOf("?") > -1) history.replaceState(null, "", "#/koolitused"); updateCatalog(); return; }
    if (el.hasAttribute("data-cat-level")) { state.catalog.level = el.getAttribute("data-cat-level"); updateCatalog(); return; }
    if (el.hasAttribute("data-cat-reset")) { state.catalog = { q: "", format: "all", level: "all" }; var qi = document.getElementById("cat-q"); if (qi) qi.value = ""; updateCatalog(); return; }
    if (el.hasAttribute("data-cal-city")) { state.calCity = el.getAttribute("data-cal-city"); updateCalendar(); return; }
    if (el.hasAttribute("data-cal-format")) { state.calFormat = el.getAttribute("data-cal-format"); updateCalendar(); return; }
    if (el.hasAttribute("data-waitlist")) { toast("Lisasime sind ootenimekirja (prototüüp)"); return; }
    if (el.hasAttribute("data-news")) { openArticle(el.getAttribute("data-news")); return; }
    if (el.hasAttribute("data-close-article")) { document.getElementById("article-dialog").close(); return; }
    if (el.hasAttribute("data-car")) {
      var tr = document.querySelector("[data-track]"), card = tr.querySelector(".news-card");
      tr.scrollBy({ left: +el.getAttribute("data-car") * (card.offsetWidth + 16), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    if (el.hasAttribute("data-portal")) { state.portalIdx = +el.getAttribute("data-portal"); render(); var sel = document.querySelector('[data-portal="' + state.portalIdx + '"]'); if (sel) sel.focus(); return; }
    if (el.hasAttribute("data-preset")) { state.admin.label = el.getAttribute("data-preset"); state.admin.show = true; document.getElementById("b-label").value = state.admin.label; document.getElementById("b-show").checked = true; updateAdminPreview(); return; }
    if (el.hasAttribute("data-badge-reset")) { var c = COURSE[state.admin.id]; state.admin = { id: c.id, label: c.badge ? c.badge.label : "", tone: c.badge ? c.badge.tone : "rose", show: !!c.badge }; render(); return; }
    if (el.hasAttribute("data-add-pkg")) { addToCart({ title: "Praktika " + el.getAttribute("data-add-pkg"), meta: "Praktikapakett · kuupäev kokkuleppel", price: +el.getAttribute("data-price"), image: "maria-portrait.jpg" }); return; }
    if (el.hasAttribute("data-toast-msg")) { toast(el.getAttribute("data-toast-msg")); return; }
  });

  document.addEventListener("input", function (e) {
    if (e.target.id === "cat-q") { state.catalog.q = e.target.value; updateCatalog(); }
    if (e.target.id === "b-label") { state.admin.label = e.target.value; updateAdminPreview(); }
  });
  document.addEventListener("change", function (e) {
    var f = e.target.form;
    if (f && f.hasAttribute("data-detail-form")) {
      var id = f.getAttribute("data-detail-form"), c = COURSE[id], sel = state.detailSel[id];
      if (e.target.name === "fmt") {
        sel.format = e.target.value;
        var ses = sessions.filter(function (s) { return s.course === id; });
        if (sel.format !== "E-õpe" && (sel.session === -1 || sel.session === null)) { var fo = ses.filter(function (s) { return s.tone !== "danger"; })[0]; sel.session = fo ? sessions.indexOf(fo) : -1; }
        var g = f.querySelector("[data-date-group]"); g.innerHTML = "<legend>Kuupäev ja linn</legend>" + dateOptions(c, sel, ses);
        f.querySelector("[data-detail-total]").textContent = eur(priceOf(c, sel.format));
      }
      if (e.target.name === "ses") sel.session = +e.target.value;
    }
    if (e.target.id === "b-course") {
      var cc = COURSE[e.target.value];
      state.admin = { id: cc.id, label: cc.badge ? cc.badge.label : "", tone: cc.badge ? cc.badge.tone : "rose", show: !!cc.badge };
      document.getElementById("b-label").value = state.admin.label; document.getElementById("b-show").checked = state.admin.show;
      document.querySelectorAll('[name="tone"]').forEach(function (r) { r.checked = r.value === state.admin.tone; });
      updateAdminPreview();
    }
    if (e.target.id === "b-show") { state.admin.show = e.target.checked; updateAdminPreview(); }
    if (e.target.name === "tone") { state.admin.tone = e.target.value; updateAdminPreview(); }
  });
  document.addEventListener("submit", function (e) {
    var f = e.target;
    e.preventDefault();
    if (f.hasAttribute("data-newsletter")) {
      var inp = f.querySelector("input");
      if (!inp.value || !inp.checkValidity()) { inp.focus(); toast("Palun sisesta korrektne e-posti aadress"); return; }
      inp.value = ""; toast("Aitäh! −10% kood saadetakse e-postile (prototüüp)"); return;
    }
    if (f.hasAttribute("data-detail-form")) {
      var id = f.getAttribute("data-detail-form"), c = COURSE[id], sel = state.detailSel[id];
      var s = sel.format !== "E-õpe" && sel.session > -1 ? sessions[sel.session] : null;
      if (sel.format !== "E-õpe" && !s) { toast("Vali sobiv kuupäev"); return; }
      addToCart({ title: c.title, meta: sel.format + (s ? " · " + fDate(s.date) + " · " + s.city : " · alusta kohe"), price: priceOf(c, sel.format), image: c.image });
      return;
    }
    if (f.hasAttribute("data-badge-form")) {
      var a = state.admin, cc = COURSE[a.id];
      cc.badge = a.show && a.label.trim() ? { label: a.label.trim(), tone: a.tone } : null;
      try { var m = {}; courses.forEach(function (x) { m[x.id] = x.badge; }); localStorage.setItem("mslab-c-badges", JSON.stringify(m)); } catch (err) { /* ignore */ }
      updateAdminPreview(); toast("Märgis salvestatud — vaata koolituste kataloogi");
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeCart(); if (menu.hasAttribute("data-open")) { closeMenu(); burger.focus(); } }
    var tab = e.target.closest && e.target.closest("[data-home-tab]");
    if (tab && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      var tabs = Array.prototype.slice.call(document.querySelectorAll("[data-home-tab]")), i = tabs.indexOf(tab);
      var nx = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]; nx.focus(); nx.click();
    }
  });

  window.addEventListener("hashchange", render);
  renderCart();
  render();
})();
