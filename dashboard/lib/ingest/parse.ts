import * as XLSX from "xlsx";
import { detectPlatform, normaliseHeader, type Platform } from "./headers";

export interface RawTable {
  sheetName: string;
  // Text of rows above the header (report titles, date ranges).
  preamble: string[];
  headers: string[];
  rows: unknown[][];
}

// Read the first sheet of an XLSX/XLS/CSV/TSV buffer and locate its header row.
export function readTable(buf: Buffer | Uint8Array, fileName: string): RawTable {
  const isText = /\.(csv|tsv|txt)$/i.test(fileName);
  const wb = isText
    ? XLSX.read(Buffer.from(buf).toString("utf8").replace(/^﻿/, ""), { type: "string", cellDates: true, raw: false })
    : XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });

  const headerIdx = findHeaderRow(grid);
  const headers = (grid[headerIdx] ?? []).map((h) => (h === null ? "" : String(h).trim()));
  const preamble = grid
    .slice(0, headerIdx)
    .map((r) => r.filter((c) => c !== null && c !== "").map(String).join(" "))
    .filter(Boolean);
  const rows = grid.slice(headerIdx + 1).filter((r) => r.some((c) => c !== null && c !== ""));
  return { sheetName, preamble, headers, rows };
}

// The header row is the first of the top 20 rows that looks like column names:
// several text cells, at least one recognisable ad-metric header.
function findHeaderRow(grid: unknown[][]): number {
  const known = /^(campaign|impr|impressions|clicks|reach|spend|cost|amount spent|total spent|day|date|ad set|ad group|results|conversions)/;
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const cells = grid[i].filter((c) => typeof c === "string" && c.trim() !== "") as string[];
    if (cells.length < 3) continue;
    const hits = cells.filter((c) => known.test(normaliseHeader(c))).length;
    const score = hits * 10 + cells.length;
    if (hits >= 2 && score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

export function sniffPlatform(t: RawTable): Platform | null {
  return detectPlatform(t.headers).platform;
}

// Parse an exported number. Handles "1,234.56", "1.234,56", "$12.30", "12%",
// "-" / "--" / "N/A" (→ null) and plain numbers.
export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s === "" || /^(-+|—|n\/?a|null|none|\s)$/i.test(s)) return null;
  s = s.replace(/[^\d.,\-]/g, "");
  if (s === "" || s === "-") return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever separator comes last is the decimal separator.
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // "1,234" / "12,345,678" → thousands; "12,5" → decimal comma.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
