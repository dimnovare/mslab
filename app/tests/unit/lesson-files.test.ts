import { describe, expect, test } from "vitest";
import { storable } from "@/lib/storable";
import { attachmentHeader, cleanFileName, hasFileSignature, lessonFileType } from "@/server/lesson-files";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("lesson file types: PDF, Word (.docx), JPEG, PNG, WebP", () => {
  test("the browser's type, or the extension when it sends none (some send none for .docx)", () => {
    expect(lessonFileType({ type: "application/pdf", name: "a.pdf" })).toBe("application/pdf");
    expect(lessonFileType({ type: "", name: "Juhend.DOCX" })).toBe(DOCX);
    expect(lessonFileType({ type: "application/octet-stream", name: "x.pdf" })).toBe("application/pdf");
    expect(lessonFileType({ type: "text/html", name: "x.pdf" })).toBeNull();
    expect(lessonFileType({ type: "", name: "x.doc" })).toBeNull();
    expect(lessonFileType({ type: "image/svg+xml", name: "x.svg" })).toBeNull();
  });
  test("a name without a dot has no extension: \"pdf\" and \"docx\" are names, not types", () => {
    for (const name of ["pdf", "docx", "PDF", "jpg", "png", ""]) expect(lessonFileType({ type: "", name }), JSON.stringify(name)).toBeNull();
    expect(lessonFileType({ type: "application/octet-stream", name: "docx" })).toBeNull();
    expect(lessonFileType({ type: "", name: "x." })).toBeNull(); // a dot and nothing after it
    expect(lessonFileType({ type: "", name: "a.b.pdf" })).toBe("application/pdf"); // the last dot counts
  });
  test("no property of Object is a type: an extension such as .constructor is not found in a plain object", () => {
    for (const name of ["x.constructor", "x.toString", "x.__proto__", "x.hasOwnProperty", "x.valueOf"]) expect(lessonFileType({ type: "", name }), name).toBeNull();
  });
  test("the first bytes must be the type: %PDF-, a ZIP for .docx, the image signatures", () => {
    expect(hasFileSignature("application/pdf", PDF)).toBe(true);
    expect(hasFileSignature("application/pdf", ZIP)).toBe(false);
    expect(hasFileSignature(DOCX, ZIP)).toBe(true);
    expect(hasFileSignature(DOCX, PDF)).toBe(false);
    expect(hasFileSignature("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  });
});

describe("the name the student sees", () => {
  test("no folder, one line, the extension kept when cut at 120, a fallback when nothing is left", () => {
    expect(cleanFileName("C:\\Users\\maria\\Juhend 1.pdf", "pdf")).toBe("Juhend 1.pdf");
    expect(cleanFileName("a/b/  Kaks\n rida.pdf ", "pdf")).toBe("Kaks rida.pdf");
    const long = cleanFileName(`${"x".repeat(200)}.pdf`, "pdf");
    expect(long).toHaveLength(120);
    expect(long.endsWith(".pdf")).toBe(true);
    expect(cleanFileName("   ", "docx")).toBe("fail.docx");
  });
  test("a cut at 120 never leaves half an emoji: the name is kept (shortened), not replaced by fail.<ext>", () => {
    const emoji = "\u{1F600}"; // two UTF-16 units: a high and a low surrogate
    // the cut (120 minus the 4 units of ".pdf") falls between the two halves
    const cutInside = cleanFileName(`${"x".repeat(115)}${emoji}.pdf`, "pdf");
    expect(cutInside).toBe(`${"x".repeat(115)}.pdf`);
    expect(storable(cutInside)).toBe(true);
    // no extension to keep: the cut at 120 falls between the two halves
    const noTail = cleanFileName(`${"x".repeat(119)}${emoji}yyyyy`, "pdf");
    expect(noTail).toBe("x".repeat(119));
    expect(storable(noTail)).toBe(true);
    // a pair that ends exactly at the cut stays whole
    const whole = cleanFileName(`${"x".repeat(114)}${emoji}yyyy.pdf`, "pdf");
    expect(whole).toBe(`${"x".repeat(114)}${emoji}.pdf`);
    expect(whole).toHaveLength(120);
    expect(storable(whole)).toBe(true);
    // a name that is not cut is not touched
    expect(cleanFileName(`Tere ${emoji}.pdf`, "pdf")).toBe(`Tere ${emoji}.pdf`);
  });
  test("Content-Disposition: an ASCII fallback and the UTF-8 name (RFC 6266)", () => {
    expect(attachmentHeader("Juhend.pdf")).toBe(`attachment; filename="Juhend.pdf"; filename*=UTF-8''Juhend.pdf`);
    expect(attachmentHeader('Kulmud "Õpik".pdf')).toBe(`attachment; filename="Kulmud __pik_.pdf"; filename*=UTF-8''Kulmud%20%22%C3%95pik%22.pdf`);
  });
  test("a name cannot break out of the header: one line, pure ASCII, exactly the two parameters", () => {
    const names = ["a\r\nX: y;b%.pdf", 'a"; filename="evil.exe', 'a\\"b.pdf', "Tere \u{1F600}.pdf", "\u0000\u007f.pdf", "a\u2028b.pdf"];
    for (const name of names) {
      const header = attachmentHeader(name);
      expect(header, JSON.stringify(name)).toMatch(/^[\x20-\x7e]+$/); // no CR, LF, other control or non-ASCII character
      // attachment, then filename (a quoted string without a quote or a backslash in it), then filename*: nothing else
      expect(header, JSON.stringify(name)).toMatch(/^attachment; filename="[^"\\]*"; filename\*=UTF-8''[A-Za-z0-9%._~!-]*$/);
    }
    expect(attachmentHeader("a\r\nX: y;b%.pdf")).toBe(`attachment; filename="a__X: y;b%.pdf"; filename*=UTF-8''a%0D%0AX%3A%20y%3Bb%25.pdf`);
  });
});
