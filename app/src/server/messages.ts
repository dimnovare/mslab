// Plain-text summaries of public submissions for Maria: the e-mail (subject + text) and a short Telegram line.
// They are written in Estonian for Maria and never shown to visitors, so they are not in the site dictionaries.

export type Summary = { subject: string; text: string; short: string };

/** label, value, and whether the value goes on its own lines below the label (free text). */
type Row = readonly [label: string, value: string | undefined, block?: boolean];

const TIME_ZONE = "Europe/Tallinn";
const LANGUAGE = { et: "eesti", ru: "vene" } as const;
const PAYMENT = { full: "100% kohe", half: "50% registreerimisel + 50% koolituspäeval" } as const;

const yesNo = (b: boolean) => (b ? "jah" : "ei");

/** "14.11.2026 kell 10:00" in Estonian time. */
export function sessionWhen(d: Date): string {
  const parts = new Intl.DateTimeFormat("et-EE", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} kell ${get("hour")}:${get("minute")}`;
}

/** Labelled lines; empty values are left out. Free text (block) goes on its own lines below its label. */
function body(title: string, rows: Row[], adminUrl: string, note?: string): string {
  const lines = rows.flatMap(([label, value, block]) => {
    const v = value?.trim();
    if (!v) return [];
    return block ? ["", `${label}:`, v] : [`${label}: ${v}`];
  });
  return [title, "", ...lines, ...(note ? ["", note] : []), "", `Admin: ${adminUrl}`, ""].join("\n");
}

type Visitor = { name: string; email: string; phone?: string; locale: "et" | "ru" };
const person = (v: Visitor): Row[] => [
  ["Nimi", v.name],
  ["E-post", v.email],
  ["Telefon", v.phone],
  ["Suhtluskeel", LANGUAGE[v.locale]],
];
const contactLine = (v: Visitor) => [v.name, v.email, v.phone].filter(Boolean).join(" · ");

type SessionInfo = { course: string; startsAt: Date; city: string; venue: string };
const sessionRows = (s: SessionInfo): Row[] => [
  ["Koolitus", s.course],
  ["Kuupäev", sessionWhen(s.startsAt)],
  ["Koht", [s.city, s.venue].filter(Boolean).join(", ")],
];
const sessionShort = (s: SessionInfo) => `${s.course} · ${sessionWhen(s.startsAt)} · ${s.city}`;

export function registrationSummary(
  s: SessionInfo & Visitor & { paymentChoice: "full" | "half"; wantsModelHelp: boolean; wantsAccount: boolean; message: string },
  adminUrl: string,
): Summary {
  const title = "Uus registreerimine (grupikoolitus)";
  return {
    subject: `Registreerimine: ${s.course}, ${sessionWhen(s.startsAt)}, ${s.city} — ${s.name}`,
    text: body(
      title,
      [
        ...sessionRows(s),
        ...person(s),
        ["Tasumine", PAYMENT[s.paymentChoice]],
        ["Abi modellide leidmisel", yesNo(s.wantsModelHelp)],
        ["Loo konto", yesNo(s.wantsAccount)],
        ["Sõnum", s.message, true],
      ],
      adminUrl,
      "Staatus: ootab ettemaksu. Koht kinnitub alles pärast vähemalt 50% ettemaksu laekumist.",
    ),
    short: `${title}\n${sessionShort(s)}\n${contactLine(s)}\nTasumine: ${PAYMENT[s.paymentChoice]}`,
  };
}

export function individualSummary(
  r: Visitor & { course: string; preferredPeriod: string; message: string; wantsModelHelp: boolean; wantsAccount: boolean },
  adminUrl: string,
): Summary {
  const title = "Individuaalkoolituse päring";
  return {
    subject: `Individuaalkoolituse päring: ${r.course} — ${r.name}`,
    text: body(
      title,
      [
        ["Koolitus", r.course],
        ["Soovitud periood või kuupäev", r.preferredPeriod],
        ...person(r),
        ["Abi modellide leidmisel", yesNo(r.wantsModelHelp)],
        ["Loo konto", yesNo(r.wantsAccount)],
        ["Sõnum", r.message, true],
      ],
      adminUrl,
      "Aeg ja tasumine lepitakse kokku.",
    ),
    short: `${title}\n${r.course} · ${r.preferredPeriod}\n${contactLine(r)}`,
  };
}

export function contactSummary(r: Visitor & { message: string }, adminUrl: string): Summary {
  const title = "Uus sõnum kodulehelt";
  return {
    subject: `Sõnum kodulehelt — ${r.name}`,
    text: body(title, [...person(r), ["Sõnum", r.message, true]], adminUrl),
    short: `${title}\n${contactLine(r)}\n${r.message.slice(0, 280)}`,
  };
}

export function purchaseInterestSummary(r: { course: string; email: string; locale: "et" | "ru" }, adminUrl: string): Summary {
  const title = "E-koolituse ostusoov";
  return {
    subject: `E-koolituse ostusoov: ${r.course}`,
    text: body(title, [["Koolitus", r.course], ["E-post", r.email], ["Suhtluskeel", LANGUAGE[r.locale]]], adminUrl, "Soovib teadet, kui makse on avatud."),
    short: `${title}\n${r.course}\n${r.email}`,
  };
}

export function practiceSummary(r: Visitor & { package: string; course: string; times: string }, adminUrl: string): Summary {
  const title = "Praktika taotlus";
  return {
    subject: `Praktika taotlus: ${r.package} — ${r.name}`,
    text: body(
      title,
      [["Pakett", r.package], ...person(r), ["Läbitud koolitus või kogemus", r.course], ["Sobivad ajad", r.times, true]],
      adminUrl,
      "Aeg kinnitatakse pärast Maria vastust.",
    ),
    short: `${title}: ${r.package}\n${contactLine(r)}\n${r.times.slice(0, 200)}`,
  };
}

export function waitlistSummary(s: SessionInfo & Visitor, adminUrl: string): Summary {
  const title = "Ootenimekiri";
  return {
    subject: `Ootenimekiri: ${s.course}, ${sessionWhen(s.startsAt)}, ${s.city} — ${s.name}`,
    text: body(title, [...sessionRows(s), ...person(s)], adminUrl),
    short: `${title}\n${sessionShort(s)}\n${contactLine(s)}`,
  };
}

/**
 * A student's wish to cancel a registration or move it to another date (the account's "Soovin tühistada / muuta aega").
 * Nothing has been changed: the registration stays as it was until Maria has talked to the student. `session` is null for
 * a registration without a date (an individual course).
 */
export function changeRequestSummary(
  r: Visitor & { registrationId: number; course: string; session: Omit<SessionInfo, "course"> | null; kind: "cancel" | "change"; message: string },
  adminUrl: string,
): Summary {
  const title = r.kind === "cancel" ? "Soov registreering tühistada" : "Soov registreeringu aega muuta";
  const info = r.session ? { course: r.course, ...r.session } : null;
  const place = info ? `${r.course}, ${sessionWhen(info.startsAt)}, ${info.city}` : r.course;
  return {
    subject: `${title}: ${place} — ${r.name}`,
    text: body(
      title,
      [
        ...(info ? sessionRows(info) : ([["Koolitus", r.course]] as Row[])),
        ["Registreeringu number", String(r.registrationId)],
        ...person(r),
        ["Sõnum", r.message, true],
      ],
      adminUrl,
      "Registreeringut ei ole muudetud. Võta õpilasega ühendust ja muuda registreering vajadusel adminis.",
    ),
    short: `${title}\n${info ? sessionShort(info) : r.course}\n${contactLine(r)}${r.message ? `\n${r.message.slice(0, 280)}` : ""}`,
  };
}
