import { describe, expect, test } from "vitest";
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
  test("Content-Disposition: an ASCII fallback and the UTF-8 name (RFC 6266)", () => {
    expect(attachmentHeader("Juhend.pdf")).toBe(`attachment; filename="Juhend.pdf"; filename*=UTF-8''Juhend.pdf`);
    expect(attachmentHeader('Kulmud "Õpik".pdf')).toBe(`attachment; filename="Kulmud __pik_.pdf"; filename*=UTF-8''Kulmud%20%22%C3%95pik%22.pdf`);
  });
});
