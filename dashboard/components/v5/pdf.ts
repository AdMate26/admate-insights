// A minimal PDF: one A4 page per JPEG, each image filling its page. JPEG goes into a
// PDF as it is (DCTDecode), so no PDF library is needed for the report download.

const A4 = { w: 595.28, h: 841.89 }; // points

export function jpegsToPdf(pages: Uint8Array[], pxW: number, pxH: number): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (x: string | Uint8Array) => {
    const b = typeof x === "string" ? enc.encode(x) : x;
    parts.push(b);
    length += b.length;
  };
  const obj = (n: number, ...body: (string | Uint8Array)[]) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    body.forEach(push);
    push("\nendobj\n");
  };
  push("%PDF-1.4\n");
  // Objects: 1 catalog, 2 page tree, then per page: the page, its drawing, its image.
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(" ")}] >>`);
  pages.forEach((jpg, i) => {
    const p = 3 + 3 * i;
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`);
    const draw = `q ${A4.w} 0 0 ${A4.h} 0 0 cm /Im${i} Do Q`;
    obj(p + 1, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
    obj(p + 2, `<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, "\nendstream");
  });
  const xref = length;
  const count = 3 + 3 * pages.length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let k = 1; k < count; k++) push(`${String(offsets[k]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

export const dataUrlBytes = (url: string) => Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
