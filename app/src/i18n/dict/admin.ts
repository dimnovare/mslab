// The admin area is Estonian only (Maria and Dim), so its strings are one dictionary here instead of et.ts + ru.ts.
// {name}, {link} are filled with fill() from "@/i18n/format".

export const adminEt = {
  meta: { title: "Haldus — MS LAB" },

  login: {
    title: "Halduse sisselogimine",
    lead: "Sisesta oma e-posti aadress, saadame sulle sisselogimislingi. Parooli pole vaja.",
    emailLabel: "E-post",
    submit: "Saada sisselogimislink",
    sending: "Saadan…",
    // The same text for an allowed and a not allowed address: the page never tells which addresses exist.
    sentTitle: "Kontrolli oma postkasti",
    sent: "Kui see aadress on lubatud, saatsime sisselogimislingi.",
    sentHint: "Link kehtib 15 minutit ja töötab ainult ühe korra.",
    again: "Sisesta aadress uuesti",
    errorEmail: "Sisesta korrektne e-posti aadress.",
    errorTooMany: "Liiga palju katseid. Proovi mõne minuti pärast.",
    errorGeneric: "Midagi läks valesti. Proovi uuesti.",
    // /admin/login?viga=link / =server after a login link was opened.
    errorLink: "See sisselogimislink on aegunud või juba kasutatud. Telli uus link.",
    errorServer: "Sisselogimine ei õnnestunud. Proovi uuesti.",
    back: "MS LAB Koolituskeskuse avalehele",
  },

  // E-mail with the login link (plain text). {link} is the verification URL.
  mail: {
    subject: "MS LAB — sisselogimislink",
    text: [
      "Tere!",
      "",
      "MS LABi halduse sisselogimiseks ava see link:",
      "{link}",
      "",
      "Link kehtib 15 minutit ja töötab ainult ühe korra. Kui sa ei soovinud sisse logida, jäta see kiri tähelepanuta.",
      "",
      "MS LAB Koolituskeskus",
    ].join("\n"),
  },

  panel: {
    hello: "Tere, {name}.",
    logout: "Logi välja",
  },
};

export type AdminDict = typeof adminEt;
