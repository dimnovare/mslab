// Estonian is the authoritative dictionary: ru.ts must have exactly the same keys (enforced by tests/unit/i18n.test.ts).
// Strings with {name} placeholders are filled with fill() from "@/i18n/format".
// Content that Maria edits (course texts, FAQ, news, hero slides, trainer text) lives in the database, not here.

export const et = {
  meta: {
    title: "MS LAB Koolituskeskus — Brow & Lash Academy",
    description: "Kulmu- ja ripsmekoolitused, mis annavad sulle oskused, enesekindluse ja kindla alguse.",
    ogAlt: "MS LAB Koolituskeskuse avaleht arvutis ja telefonis",
  },

  nav: {
    courses: "Koolitused",
    calendar: "Koolituskalender",
    practice: "Praktika",
    trainer: "Koolitaja",
    news: "Uudised",
    login: "Logi sisse",
    cart: "Ostukorv",
    menu: "Menüü",
    langSwitch: "Vaheta keelt",
    mainLabel: "Põhimenüü",
    openMenu: "Ava menüü",
    closeMenu: "Sulge menüü",
    home: "MS LAB Koolituskeskus — avaleht",
    skip: "Liigu sisuni",
  },

  hero: {
    primaryCta: "Leia oma koolitus",
    secondaryCta: "Vaata koolituskalendrit",
    caption: "BROW & LASH ACADEMY",
    carouselLabel: "Esiletõstetud koolitused",
    carousel: "karussell",
    slide: "Slaid",
    prevSlide: "Eelmine slaid",
    nextSlide: "Järgmine slaid",
  },

  // Section headings that only appear on the home page.
  home: {
    upcomingLabel: "Tulevased koolitused",
    coursesEyebrow: "Koolitused",
    coursesTitle: "Vali oma koolitus.",
    allCourses: "Kõik koolitused",
    statementEyebrow: "MS LAB Koolituskeskus",
    faqEyebrow: "KKK",
    faqTitle: "Korduma kippuvad küsimused",
    contactEyebrow: "Kontakt",
    contactTitle: "Ei tea, milline koolitus sobib?",
    contactLead: "Kirjuta Mariale — soovitan sulle sobiva koolituse ja õppevormi.",
    contactReply: "vastab tavaliselt ühe tööpäeva jooksul",
  },

  // "Kuidas soovid õppida?" block (home) and the format explainer (catalogue). Hybrid has no steps (K8).
  formats: {
    eyebrow: "Sinu õppeteekond",
    title: "Kuidas soovid õppida?",
    lead: "Enne ostu näed täpselt, kuidas õppimine käib ja mis sind lõpuks ees ootab.",
    tabsLabel: "Õppevorm",
    overviewTitle: "Õppevormid",
    howItWorks: "Kuidas see käib",
    elearning: {
      name: "E-õpe",
      short: "Veebis, omas tempos",
      question: "Mis on e-õpe?",
      definition:
        "E-õpe tähendab eelsalvestatud videokoolitust, mida saad vaadata endale sobival ajal ja kohas. Ostuga luuakse sulle automaatselt õpilase konto, kus on videod, õppematerjalid ja test.",
      facts: ["Videod ja õppematerjalid", "Test ja tunnistus", "Õpid omas tempos"],
      steps: [
        { title: "Vali sobiv koolitus", text: "Baas- või täiendkoolitus" },
        { title: "Lisa koolitus ostukorvi", text: "Näed kohe lõpphinda" },
        { title: "Vormista ost", text: "Maksa pangalingiga" },
        { title: "Sulle luuakse automaatselt õpilase konto", text: "Kinnitus tuleb e-postiga" },
        { title: "Logi sisse ja alusta õppimist", text: "Kohe, omas tempos" },
      ],
      link: "Vaata e-õppe koolitusi",
    },
    contact: {
      name: "Kontaktõpe",
      short: "Kohapeal koolitajaga",
      question: "Mis on kontaktõpe?",
      definition:
        "Kontaktõpe on füüsiline, kohapeal toimuv koolitus koolitaja juhendamisel. Valida saab individuaalkoolituse või väikese grupikoolituse vahel. Praktika toimub päris modellidel ja kõik töövahendid on kohapeal olemas.",
      facts: ["Individuaal- või grupikoolitus", "Praktika modellidel", "Vahendid kohapeal"],
      steps: [
        { title: "Vali koolitus ja kuupäev", text: "Kalendrist näed linna ja vabu kohti" },
        { title: "Registreeru ja tasu", text: "100% või 50% ettemaks" },
        { title: "Saad juhised e-postiga", text: "Aeg, koht ja ettevalmistus" },
        { title: "Koolituspäev kohapeal", text: "Teooria ja praktika modellil" },
        { title: "Tunnistus", text: "Pärast edukat lõpetamist" },
      ],
      link: "Vaata kontaktõppe koolitusi",
    },
    // Hybrid is only an explanation: a student combines an e-learning and a contact course (K1, K8). No steps, no filter.
    hybrid: {
      name: "Hübriidõpe",
      short: "Veeb + kohapeal",
      question: "Mis on hübriidõpe?",
      definition:
        "Hübriidõpe ühendab kaks erinevat õppevormi: e-õpe ja kontaktõpe. Teooria omandad iseseisvalt veebis omas tempos ning praktiline osa toimub koolitaja juhendamisel kohapeal. Hübriidõppe koostad ise, valides sobiva e-õppe ja kontaktõppe koolituse.",
      facts: ["Teooria veebis", "Praktika kohapeal"],
      link: "Vaata kõiki koolitusi",
    },
  },

  catalogue: {
    title: "Leia oma koolitus.",
    intro: "Vali õppevorm ja tase. Iga õppevormi juures näed, kuidas õppimine samm-sammult käib.",
    search: "Otsi koolitust",
    formatLabel: "Õppevorm",
    levelLabel: "Tase",
    filterAll: "Kõik",
    allLevels: "Kõik tasemed",
    levelBasic: "Baaskoolitused",
    levelAdvanced: "Täiendkoolitused",
    emptyTitle: "Sobivat koolitust ei leitud",
    emptyText: "Muuda otsingut või vaata kõiki koolitusi.",
    resetFilters: "Lähtesta filtrid",
    onlineStart: "Veebis · alusta kohe",
    from: "alates",
    cardCta: "Vaata õppekava",
    // Format explainer: the hybrid card and note only explain (K1, K8); they never filter.
    readMore: "Loe lähemalt",
    hybridNote: "Soovid e-õpet ja kontaktõpet omavahel kombineerida?",
    results: "Leitud koolitusi: {n}",
  },

  course: {
    levelBasic: "Baaskoolitus",
    levelAdvanced: "Täiendkoolitus",
    modulesLabel: "Moodulid",
    videosLabel: "Videotunnid",
    accessLabel: "Ligipääs",
    monthsUnit: "kuud",
    languageLabel: "Õppekeel",
    durationLabel: "Kestus",
    trainerLabel: "Koolitaja",
    citiesLabel: "Linnad",
    discountLabel: "Soodustus",
    priceLabel: "Hind",
    // E-learning purchase (P8, P9)
    payNow: "Maksa kohe — 100% pangalingiga",
    instalmentSoon: "Vormista järelmaks — tulekul",
    // Under the disabled instalment option; says "later" without repeating the option name.
    instalmentNote: "See võimalus lisandub hiljem.",
    buyNow: "Osta kohe",
    checkoutSoon:
      "Makse lisandub peagi — saad koolituse osta niipea, kui makse on avatud. Jäta oma e-post, anname teada.",
    includesTitle: "Koolitus sisaldab",
    // E-learning "Koolitus sisaldab" (P8): the video count line comes first, then these.
    includesVideos: "{n} õppevideot",
    includesElearning: [
      "Õppematerjalid",
      "Teadmiste test",
      "Praktilise töö hindamine",
      "Tunnistus pärast edukat lõpetamist",
    ],
    descriptionTitle: "Koolitusest",
    programmeTitle: "Õppekava",
    outcomesTitle: "Pärast koolitust oskad",
    locked: "Lukustatud",
    breadcrumb: "Lehe asukoht",
    thumbsLabel: "Kõik pildid",
    prevThumbs: "Eelmised pildid",
    nextThumbs: "Järgmised pildid",
    individualNote: "Individuaalkoolituse aja ja tasumise lepime kokku. Märgi soovitud periood — Maria võtab sinuga ühendust.",
    // No group date can be picked (none, all full or cancelled): offer the individual course instead.
    switchIndividual: "Vali individuaalkoolitus",
    sessionRequired: "Vali sobiv kuupäev.",
    // The picked date filled up or was cancelled while the form was open (checked again when the form is sent).
    sessionFull: "See kuupäev on vahepeal täitunud. Vali teine kuupäev.",
    sessionUnavailable: "Sellele kuupäevale ei saa enam registreeruda. Vali teine kuupäev.",
    // Contact course registration (P10 - P15)
    participationLabel: "Osalemisviis",
    group: "Grupikoolitus",
    individual: "Individuaalkoolitus",
    pickSession: "Vali kuupäev ja linn",
    noSessions: "Uued kuupäevad avaldatakse peagi.",
    modelsNote: "Võid tulla oma modellidega; vajadusel aitame leida.",
    confirmAfterPrepayment: "Koht kinnitatakse pärast vähemalt 50% ettemaksu laekumist.",
    registerSuccess:
      "Registreerimine on vastu võetud. Saadame sulle e-postiga makse juhised; koht kinnitub pärast ettemaksu.",
    // Both types
    share: "Jaga koolitust",
    shareCopied: "Koolituse link kopeeritud.",
    // ♡ toggle (P6): "favourite" until pressed, then "favourited"; "unfavourite" is the pressed button's hint
    favourite: "Lisa lemmikutesse",
    favourited: "Lemmikutes",
    unfavourite: "Eemalda lemmikutest",
    recommendations: "Sulle võiksid huvi pakkuda",
    galleryLabel: "Koolituse pildid",
  },

  calendar: {
    title: "Koolituskalender",
    lead: "Iga koolituse juures on kohe näha linn, õppevorm, keel ja vabade kohtade arv.",
    cityLabel: "Linn",
    allCities: "Kõik linnad",
    seatsLabel: "Vabu kohti",
    stateOpen: "Vabu kohti",
    stateFew: "Viimased kohad",
    stateFull: "Kohad täis", // prototype B's wording (checklist, Task 2 ruling)
    stateCancelled: "Tühistatud",
    register: "Registreeru",
    // Row buttons (prototype A): full → waitlist form, cancelled → the course page with its other dates.
    waitlist: "Ootenimekirja",
    others: "Vaata teisi",
    empty: "Selles linnas hetkel koolitusi pole.",
    results: "Kuupäevi: {n}",
  },

  practice: {
    title: "Praktika",
    eyebrow: "Individuaalpraktika",
    onlyParnuShort: "Ainult Pärnus",
    // Home practice block eyebrow above the big "Praktika" heading (H11, C22).
    eyebrowParnu: "Individuaalpraktika · ainult Pärnus",
    onlyParnu: "Praktika toimub ainult Pärnus, MS LAB stuudios.",
    slogan: "Teadmised muutuvad oskusteks.",
    lead: "Harjuta, küsi ja katseta. Üks-ühele juhendamine aitab leida sinu käekirja ja järgmise arengusammu.",
    intro:
      "Praktikapäev on mõeldud kõigile, kes on koolituse läbinud ja soovivad enne iseseisvat tööd rohkem kogemust — päris modellidel, koolitaja kõrval.",
    panelText:
      "Praktika toimub koolitaja juhendamisel. Õpilasele leiab koolituskeskus vajalikud modellid ning tagab kõik tööks vajalikud vahendid. Koolitaja jälgib kogu tööprotsessi, annab jooksvalt juhiseid, näpunäiteid ja tagasisidet.",
    protocolTitle: "Praktikaprotokoll",
    protocolText:
      "Kogu praktika vältel täidab koolitaja praktikaprotokolli, mis annab kokkuvõtte kogu praktikapäevast. Pärast praktikat saad protokolli endale — see on sinu personaalne tagasiside.",
    protocolPoints: ["Mis õnnestus hästi", "Millele pöörata tähelepanu", "Mida veel arendada"],
    packagesEyebrow: "Praktikapaketid",
    packagesTitle: "Vali praktikapakett.",
    package: "Praktikapakett",
    duration: "Umbkaudne kestus",
    register: "Registreeru",
    requestTitle: "Registreeru praktikale",
    selectedPackage: "Valitud pakett: {name}",
    completedCourse: "Läbitud koolitus või kogemus",
    preferredTimes: "Millised ajad sulle sobivad?",
    preferredTimesPlaceholder: "Näiteks tööpäeva õhtud Pärnus",
    requestNote: "See on aja kokkuleppimise taotlus. Kohtumine kinnitatakse pärast Maria vastust.",
    requestSubmit: "Saada taotlus",
    requestSent: "Taotlus on saadetud.",
    requestSentText: "Maria võtab sinuga ühendust ja pakub sobiva aja.",
    packageRequired: "Vali praktikapakett.",
  },

  trainer: {
    eyebrow: "Sinu koolitaja",
    pageEyebrow: "Koolitaja",
    readMore: "Loe koolitajast",
    portraitAlt: "Koolitaja {name}",
    worksTitle: "Koolitaja tööd",
    storyTitle: "Koolituskeskuse lugu",
    journeyTitle: "Koolitaja teekond",
    viewCourses: "Vaata koolitusi",
  },

  news: {
    eyebrow: "Blogi",
    title: "Uudised ja nõuanded",
    lead: "Nõuanded, uued koolitused ja õpilaste lood. Iga kaart viib täismahus postitusele.",
    all: "Kõik postitused",
    readMore: "Loe edasi",
    more: "Loe veel",
    carouselLabel: "Postituste karussell",
    // /uudised (prototype D pNewsList: eyebrow "Uudised ja nõuanded", heading "Blogi.").
    pageTitle: "Blogi.",
    coursesCta: "Vaata koolitusi",
  },

  forms: {
    name: "Nimi",
    email: "E-post",
    phone: "Telefon",
    message: "Sõnum",
    messagePlaceholder: "Nt. olen algaja ja huvitun kulmudest…",
    submit: "Saada",
    sending: "Saadan…",
    register: "Registreeru",
    terms: "Olen tutvunud tingimustega ja nõustun nendega.",
    // Contact-course registration extras (P11, P14, P16)
    modelHelp: "Soovin koolituskeskuse abi modellide leidmisel",
    createAccount: "Loo mulle kohe konto MS LAB keskkonda",
    paymentLabel: "Tasumine",
    payFull: "100% kohe",
    payHalf: "50% registreerimisel + 50% koolituspäeval",
    // Individual request, waitlist, cart interest
    preferredPeriod: "Soovitud periood või kuupäev",
    preferredPeriodPlaceholder: "Nt detsembri teine pool või 12.12",
    optional: "valikuline",
    requestSubmit: "Saada päring",
    interestSubmit: "Anna mulle teada",
    waitlistTitle: "Liitu ootenimekirjaga",
    waitlistLead: "Jäta oma e-post ja anname teada, kui koht vabaneb või lisandub uus kuupäev.",
    waitlistSubmit: "Liitu ootenimekirjaga",
    // Contact page
    contactPageTitle: "Alustame vestlusest.",
    contactPageLead: "Küsimus koolituse, praktika või koostöö kohta? Jäta oma mõte siia.",
    contactDetails: "Kontaktandmed",
    address: "Asukoht",
    // Results and errors
    contactSent: "Aitäh! Sinu sõnum on saadetud.",
    individualSent: "Aitäh! Sinu päring on saadetud.",
    waitlistSent: "Aitäh! Oled ootenimekirjas.",
    interestSent: "Aitäh! Anname teada, kui makse on avatud.",
    errorRequired: "See väli on kohustuslik.",
    errorEmail: "Sisesta korrektne e-posti aadress.",
    errorGeneric: "Midagi läks valesti. Proovi uuesti.",
    errorTooMany: "Liiga palju katseid. Proovi mõne minuti pärast.",
  },

  footer: {
    tagline: "Õpilase edu on meie eesmärk. Õpi. Arene. Loo.",
    learnTitle: "Sinu õpiteekond",
    allCourses: "Kõik koolitused",
    orgTitle: "MS LAB",
    news: "Uudised ja inspiratsioon",
    contact: "Kontakt ja koostöö",
    meetTitle: "Kohtume sinu järgmisel sammul.",
    cities: "Pärnu · Tallinn · Tartu",
    online: "Veebis kõikjal sinuga.",
    contactCta: "Võta ühendust",
    copyright: "© {year} MS LAB Koolituskeskus",
    privacy: "Privaatsus",
    terms: "Õppetingimused",
  },

  // Newsletter block, placed inside the footer (H13). {discount} comes from the newsletter setting, e.g. "10%".
  newsletter: {
    eyebrow: "MS LABi kirjad",
    titleFirst: "Hea järgmine samm.",
    titleSecond: "Otse sinu postkasti.",
    body: "Uued koolitused, kasulikud mõtted ja {discount} tervitussoodustus sinu esimesele koolitusele.",
    emailLabel: "Sinu e-post",
    emailPlaceholder: "nimi@e-post.ee",
    submit: "Liitu",
    consent: "Soovin saada MS LABi uudiskirju. Saan igal ajal loobuda.",
    confirmTitle: "Kinnita oma e-post",
    confirmText: "Saatsime sulle kinnituskirja. Vajuta kirjas olevale lingile, et liitumine lõpule viia.",
    confirmedTitle: "Tere tulemast MS LABi!",
    confirmedText: "Sinu liitumine on kinnitatud.",
    sentTitle: "Kontrolli oma postkasti",
    // Home page notice after the confirmation link (/?uudiskiri=kinnitatud or =vigane).
    linkInvalid: "See kinnituslink ei kehti. Liitu uudiskirjaga uuesti lehe allosas.",
  },

  // E-mails to visitors (plain text). {link} is the confirmation URL.
  mail: {
    confirmSubject: "Kinnita MS LABi uudiskirjaga liitumine",
    confirmText: [
      "Tere!",
      "",
      "Aitäh, et soovid MS LABi uudiskirja. Liitumise kinnitamiseks ava see link:",
      "{link}",
      "",
      "Kui sa ei soovinud uudiskirjaga liituda, jäta see kiri tähelepanuta — ilma kinnituseta me sulle uudiskirju ei saada.",
      "",
      "MS LAB Koolituskeskus",
    ].join("\n"),
  },

  // /ostukorv: e-learning purchase placeholder until bank-link payment arrives (P9).
  cart: {
    title: "Ostukorv",
    emptyTitle: "Ostukorv on tühi",
    emptyText: "Vali endale sobiv e-koolitus — selle saad osta kohe, kui makse avaneb.",
    total: "Kokku",
  },

  // Campaign popup. No "Mitte praegu" button (M3); the CTA label is editable in admin, this is the default (M4).
  campaign: {
    cta: "Leia enda koolitus",
    codeLabel: "Sooduskood",
    copy: "Kopeeri",
    copied: "Kopeeritud",
    // when the browser gives no clipboard: the code is selected for the visitor to copy
    selected: "Kood on märgitud.",
  },

  common: {
    siteName: "MS LAB Koolituskeskus",
    home: "Avaleht",
    close: "Sulge",
    previous: "Eelmine",
    next: "Järgmine",
    imageViewer: "Pildivaatur",
    openImage: "Ava pilt suuremalt",
    accountSoon: "Õppija konto avaneb peagi",
  },

  // Localized 404 inside the site shell.
  notFound: {
    title: "Lehte ei leitud",
    text: "Seda lehte ei ole olemas või on see teisaldatud.",
    home: "Avalehele",
  },
};

export type Dict = typeof et;
