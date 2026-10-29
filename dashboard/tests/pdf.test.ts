import { describe, expect, it } from "vitest";
import { jpegsToPdf } from "@/components/v5/pdf";

// The report download: one A4 page per drawn JPEG, in a PDF readers can open.
describe("report PDF", () => {
  it("has a header, one page per image, and a cross-reference table that points at each object", async () => {
    const fakeJpeg = (n: number) => Uint8Array.from({ length: 64 }, (_, i) => (i * 7 + n) % 256);
    const pdf = jpegsToPdf([fakeJpeg(1), fakeJpeg(2), fakeJpeg(3)], 1588, 2246);
    expect(pdf.type).toBe("application/pdf");
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("/Type /Pages /Count 3");
    expect(text.match(/\/Type \/Page /g)).toHaveLength(3);
    expect(text.match(/\/Filter \/DCTDecode \/Length 64 /g)).toHaveLength(3);
    // startxref is the byte offset of "xref"; each entry is the byte offset of "N 0 obj".
    const startxref = Number(/startxref\n(\d+)\n/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const entries = text.slice(startxref).split("\n").slice(3).filter((l) => / 00000 n $/.test(l));
    expect(entries).toHaveLength(3 + 3 * 3 - 1);
    entries.forEach((l, k) => {
      const at = Number(l.slice(0, 10));
      expect(text.slice(at, at + `${k + 1} 0 obj`.length)).toBe(`${k + 1} 0 obj`);
    });
    // The images go in unchanged.
    const first = text.indexOf("stream\n", text.indexOf("/DCTDecode")) + "stream\n".length;
    expect(Array.from(bytes.slice(first, first + 64))).toEqual(Array.from(fakeJpeg(1)));
  });
});
