// ACC report: the month's "Report Earning - Youtube" workbook from YouTube Studio's
// "Revenue source" exports. One builder for both places that make it:
//   scripts/acc-revenue-sources.mjs   (Node, reads the month folder on this PC)
//   รายได้ → Monthly ACC → "รายงาน Revenue source"   (the admin's browser; files never leave the PC)
// Raw numbers from the files and the Monthly ACC data; this only places them.
//
// Relative imports only: the script runs this file directly with Node. ExcelJS and JSZip are
// passed in, so the browser and Node each use their own build.
import { EXPORT_COLUMNS, SOURCE_COLUMNS, matchRow, monthLabels, parseCmsChannels, parseSourceTable, parseZipName, type SheetRow } from "./revenueSources.ts";

/* eslint-disable @typescript-eslint/no-explicit-any -- ExcelJS is passed in untyped (two builds). */

export const BOOK = /^Report Earning - Youtube - (\d{4}) (\d{2})\.xlsx$/i;
/** The team's workbook or one this report made (" (generated)", " (1)" copies too). */
export const ANY_BOOK = /^Report Earning - Youtube - (\d{4}) (\d{2})(?: \(generated\))?(?: \(\d+\))?\.xlsx$/i;
export const CHANNEL_CMS = /^Channel .*CMS\.zip$/i;
export const EXPORT_FILE = /^Monthly-ACC-.*USD\.xlsx$/i;

export type Bytes = ArrayBuffer | Uint8Array;
export interface NamedBytes {
  name: string;
  data: Bytes;
}

export interface ReportInput {
  ExcelJS: any;
  JSZip: any;
  year: string;
  month: string;
  /** This month's workbook, or another month's as the template. */
  book: NamedBytes;
  isTemplate: boolean;
  /** Where the template came from, for the report ("09\Report Earning … 09.xlsx"). */
  templateLabel?: string;
  /** Monthly ACC rows in USD (the export's columns), and where they came from. */
  exportRows: Record<string, unknown>[] | null;
  exportName: string;
  /** Every "Revenue source … .zip" of the month (the whole-CMS one included). */
  zips: NamedBytes[];
  /** "Channel … CMS.zip": this month's, or another month's (`own` false). */
  channelCms: (NamedBytes & { own: boolean; label?: string }) | null;
  now?: Date;
}

export interface ReportResult {
  data: ArrayBuffer;
  fileName: string;
  report: string[];
  filled: number;
  rows: number;
  /** Each channel row of the Revenue source table as built (USD; null = no file / "-"), for revenueSources/{YYYY-MM}. */
  channels: ChannelSources[];
}

/** One channel line of a month's Revenue source table (rows 53–76). */
export interface ChannelSources {
  name: string;
  /** Source name (SOURCE_COLUMNS) → USD, null where the file had none. */
  sources: Record<string, number | null>;
  /** YouTube Studio's Total (or the API's for the split lines); null without a file. */
  total: number | null;
  /** ถกไม่เถียง / เงินทองของจริง: split from TERO DIGITAL, "-" for every source but Ads / Premium. */
  splitFromTeroDigital: boolean;
}

/** First CSV in the zip with this file name. */
async function csvFrom(JSZip: any, data: Bytes, name: string): Promise<string | null> {
  const zip = await JSZip.loadAsync(data);
  const entry = Object.values(zip.files as Record<string, any>).find((f) => !f.dir && String(f.name).split("/").pop() === name);
  return entry ? entry.async("string") : null;
}

const text = (v: any): string => (v && typeof v === "object" ? (v.richText ? v.richText.map((t: any) => t.text).join("") : (v.result ?? v.text ?? "")) : (v ?? "")).toString().trim();
const num = (v: any): number => {
  const x = v && typeof v === "object" ? v.result : v;
  return typeof x === "number" ? x : 0;
};
const TYPED = "FFFFF2A8";
/** Yellow = typed by hand for this month. A new style object: cells share theirs. */
const mark = (cell: any) => {
  cell.value = null;
  cell.style = { ...cell.style, fill: { type: "pattern", pattern: "solid", fgColor: { argb: TYPED } } };
};

/** The channel rows of the Revenue source table (D53:E76) of a workbook: for the checklist. */
/** A channel row of the workbook; hadFile = it had numbers from a file (last month, for a template). */
export type BookChannel = SheetRow & { hadFile: boolean };

export async function workbookChannels(ExcelJS: any, data: Bytes): Promise<BookChannel[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const sheet = wb.worksheets.find((w: any) => /^Report_/i.test(w.name));
  if (!sheet) throw new Error("ไม่พบแท็บ Report_<เดือน> ในไฟล์");
  const rows: BookChannel[] = [];
  for (let r = 53; r <= 76; r++) {
    const name = text(sheet.getCell(r, 4).value);
    const hadFile = Array.from({ length: SOURCE_COLUMNS.length }, (_, i) => sheet.getCell(r, 6 + i).value).some((v) => typeof v === "number" || (v && typeof v === "object" && typeof v.result === "number"));
    if (name) rows.push({ row: r, name, id: text(sheet.getCell(r, 5).value), hadFile });
  }
  return rows;
}

export async function cmsChannelsOf(JSZip: any, data: Bytes): Promise<Map<string, string>> {
  return parseCmsChannels((await csvFrom(JSZip, data, "Table data.csv")) || "");
}

export async function buildRevenueReport(input: ReportInput): Promise<ReportResult> {
  const { ExcelJS, JSZip, year, month, isTemplate } = input;
  const report: string[] = [];
  const monthStart = `${year}-${month}-01`;
  const bookName = `Report Earning - Youtube - ${year} ${month}.xlsx`;
  if (isTemplate) report.push(`ใช้ไฟล์แม่แบบ: ${input.templateLabel || input.book.name}`);

  const cmsZip = input.channelCms;
  const cms = cmsZip ? await cmsChannelsOf(JSZip, cmsZip.data) : new Map<string, string>();
  if (cmsZip && !cmsZip.own) report.push(`ไม่มีไฟล์ Channel … CMS.zip ในโฟลเดอร์นี้: ใช้ Channel ID จาก ${cmsZip.label || cmsZip.name} (ID ไม่เปลี่ยนตามเดือน)`);
  if (!cmsZip) report.push("ไม่มีไฟล์ Channel … CMS.zip: จับคู่ช่องด้วยชื่อเท่านั้น");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(input.book.data);
  const sheet = wb.worksheets.find((w: any) => /^Report_/i.test(w.name));
  if (!sheet) throw new Error("ไม่พบแท็บ Report_<เดือน> ในไฟล์");

  // The Monthly ACC rows (USD): needed for a template, used for Total Earnings whenever there.
  const exportFile = input.exportRows ? input.exportName : "";
  if (isTemplate && !input.exportRows) throw new Error(`ไม่พบข้อมูล Monthly ACC ของ ${year}-${month} (USD)`);
  const byName = new Map<string, Record<string, unknown>>();
  const heads = new Set<string>();
  for (const r of input.exportRows || []) {
    Object.keys(r).forEach((k) => heads.add(k));
    byName.set(text(r["Channel Display Name"]), r);
  }
  const has = (h: string) => heads.has(h);
  const get = (name: string, h: string) => byName.get(name)?.[h];
  if (input.exportRows) for (const h of ["Channel Display Name", ...EXPORT_COLUMNS]) if (!has(h)) throw new Error(`${exportFile} ไม่มีคอลัมน์ "${h}"`);

  if (isTemplate) {
    const labels = monthLabels(year, month);
    sheet.name = labels.sheet;
    sheet.getCell("N4").value = labels.header;
    let fromExport = 0;
    for (let r = 7; r <= 30; r++) {
      const name = text(sheet.getCell(r, 1).value);
      const row = byName.get(name);
      const note = row && has("หมายเหตุ") ? text(row["หมายเหตุ"]) : "";
      const hasNumbers = !!row && EXPORT_COLUMNS.some((h) => typeof row[h] === "number");
      if (!hasNumbers) {
        // Not in the connected CMS (the export's note says so): typed by hand, as before.
        for (let c = 3; c <= 12; c++) mark(sheet.getCell(r, c));
        report.push(`แถว ${r} ${name}: ${note || "ไม่มีในไฟล์ export"} — ต้องกรอกเอง (สีเหลือง)`);
        continue;
      }
      EXPORT_COLUMNS.forEach((h, i) => {
        const v = row![h];
        sheet.getCell(r, 3 + i).value = typeof v === "number" ? v : null;
      });
      fromExport++;
    }
    // THB at this month's rate (M5) instead of last month's number written into the formula.
    for (let r = 7; r <= 30; r++) {
      const q = sheet.getCell(r, 17);
      if (q.formula && /^P\d+\*[\d.]+$/.test(q.formula)) q.value = { formula: `P${r}*$M$5` };
    }
    report.push(`แถว 7–30: ใส่จาก ${exportFile} ${fromExport} ช่อง`);
    for (const a of ["M5", "N5", "B35", "B36", "B42", "B44", "B48"]) mark(sheet.getCell(a));
    report.push("ต้องกรอกเองเดือนนี้ (สีเหลือง): M5 อัตราแลกเปลี่ยน, N5 W/T รวม, B35–B36 AdSense, B42 Withholding, B44 Bank charge, B48 Processing fee");
  }

  // K and L (Ads, Premium) from the export for every month, not only a template: numbers
  // typed by hand earlier in the month go stale as YouTube revises them. A line without
  // numbers in the export keeps what the workbook has.
  const ADS = "Ads Partner Revenue (USD)";
  const PREMIUM = "YouTube Premium partner revenue (USD)";
  let withAdsPremium = 0;
  for (let r = 7; r <= 30; r++) {
    const name = text(sheet.getCell(r, 1).value);
    const ads = get(name, ADS);
    const premium = get(name, PREMIUM);
    if (typeof ads !== "number" || typeof premium !== "number") continue;
    sheet.getCell(r, 11).value = ads;
    sheet.getCell(r, 12).value = premium;
    withAdsPremium++;
  }
  if (exportFile) report.push(`K7:L30 Ads, Premium = ${exportFile} ${withAdsPremium} แถว · แถวที่เหลือคงค่าเดิมในไฟล์`);

  // Total Earnings (M7:M30) = Estimated partner revenue, every source as in YouTube Analytics
  // (Ads + Premium leave out Shopping, memberships, Super Thanks…). W/T, bank fee, share and
  // THB follow from M as before. A line without it in the export keeps K+L. Every M cell gets
  // its own formula or value (the column was one shared formula).
  const TOTAL = "Estimated partner revenue (USD)";
  if (exportFile && !has(TOTAL)) report.push(`${exportFile} ไม่มีคอลัมน์ "${TOTAL}" (export ก่อน 30 ต.ค. 2026): Total Earnings = K+L เหมือนเดิม`);
  if (!exportFile) report.push(`ไม่มีไฟล์ Monthly-ACC-${year}-${month}-USD.xlsx: Total Earnings = K+L (Ads + Premium) ไม่ตรงกับ YouTube Analytics`);
  let withTotal = 0;
  for (let r = 7; r <= 30; r++) {
    const v = get(text(sheet.getCell(r, 1).value), TOTAL);
    if (typeof v === "number") {
      sheet.getCell(r, 13).value = v;
      withTotal++;
    } else sheet.getCell(r, 13).value = { formula: `K${r}+L${r}` };
  }
  if (exportFile && has(TOTAL)) report.push(`M7:M30 Total Earnings = ${TOTAL} จาก ${exportFile} ${withTotal} แถว · แถวที่เหลือ = K+L`);

  // Check the block is where it was built: row 52 holds the source names in F–P. A column
  // added later (P) may still be missing: it gets its heading and the look of column O.
  const LAST = 6 + SOURCE_COLUMNS.length - 1;
  SOURCE_COLUMNS.forEach((s, i) => {
    const cell = sheet.getCell(52, 6 + i);
    const head = text(cell.value);
    const wasOurs = /^Total ตามไฟล์ Studio|^Ad + Premium/.test(head);
    if ((!head || wasOurs) && 6 + i > 15) {
      cell.value = s;
      cell.style = { ...sheet.getCell(52, 15).style };
      for (let r = 53; r <= 76; r++) sheet.getCell(r, 6 + i).style = { ...sheet.getCell(r, 15).style };
      sheet.getColumn(6 + i).width = sheet.getColumn(15).width;
      return;
    }
    if (!head.toLowerCase().startsWith(s.toLowerCase().slice(0, 20))) throw new Error(`แถว 52 คอลัมน์ ${String.fromCharCode(70 + i)} ควรเป็น "${s}" แต่เป็น "${head}"`);
  });
  // The all-channel table on the left (A52:B…) gets a row for the added source too.
  SOURCE_COLUMNS.forEach((s) => {
    for (let r = 53; r <= 70; r++) {
      const label = text(sheet.getCell(r, 1).value);
      if (label.toLowerCase() === s.toLowerCase()) return;
      if (!label) {
        sheet.getCell(r, 1).value = s;
        sheet.getCell(r, 1).style = { ...sheet.getCell(r - 1, 1).style };
        sheet.getCell(r, 2).style = { ...sheet.getCell(r - 1, 2).style };
        return;
      }
    }
  });

  const rows: SheetRow[] = [];
  for (let r = 53; r <= 76; r++) {
    const name = text(sheet.getCell(r, 4).value);
    if (name) rows.push({ row: r, name, id: text(sheet.getCell(r, 5).value) });
  }
  // The table above (rows 7–30): Ads + Premium per channel name.
  const upper = new Map<string, { row: number; adsPremium: number }>();
  for (let r = 7; r <= 30; r++) upper.set(text(sheet.getCell(r, 1).value), { row: r, adsPremium: num(sheet.getCell(r, 11).value) + num(sheet.getCell(r, 12).value) });

  const filled = new Set<number>();
  const totals = new Map<number, number>();
  /** A "Revenue source" export of the whole CMS account (its name says CMS), for A53:B63. */
  let accountSources: Record<string, number> | null = null;
  for (const f of input.zips) {
    const z = parseZipName(f.name);
    if (!z) continue;
    if (/\bCMS\b/i.test(z.channel)) {
      if (z.start !== monthStart) report.push(`เตือน: ${f.name} เป็นช่วง ${z.start} ถึง ${z.end} ไม่ใช่เดือน ${year}-${month}`);
      accountSources = parseSourceTable((await csvFrom(JSZip, f.data, "Table data.csv")) || "");
      report.push(`ตารางซ้าย A52:B ← ${f.name} (Revenue source ทั้ง CMS)`);
      continue;
    }
    const m = matchRow(z.channel, rows, cms);
    if (!m) {
      report.push(`ไม่พบแถวของช่อง "${z.channel}" (${f.name}) — ไม่ได้ใส่`);
      continue;
    }
    if (filled.has(m.row.row)) {
      report.push(`ช่อง "${z.channel}" ซ้ำกับแถว ${m.row.row} — ใช้ไฟล์แรก`);
      continue;
    }
    if (z.start !== monthStart) report.push(`เตือน: ${f.name} เป็นช่วง ${z.start} ถึง ${z.end} ไม่ใช่เดือน ${year}-${month}`);
    const table = parseSourceTable((await csvFrom(JSZip, f.data, "Table data.csv")) || "");
    const known = new Set<string>(["Total", ...SOURCE_COLUMNS]);
    const extra = Object.keys(table).filter((k) => !known.has(k));
    if (extra.length) report.push(`เตือน: ${z.channel} มีประเภทรายได้ที่ไม่มีคอลัมน์ (${extra.join(", ")}) — ไม่ได้ใส่`);
    SOURCE_COLUMNS.forEach((s, i) => {
      sheet.getCell(m.row.row, 6 + i).value = s in table ? table[s] : null;
    });
    filled.add(m.row.row);
    if ("Total" in table) totals.set(m.row.row, table.Total);
    report.push(`แถว ${m.row.row} ${m.row.name} ← ${z.channel} (จับคู่ด้วย ${m.by === "id" ? "Channel ID" : "ชื่อ"})`);
  }
  for (const r of rows) {
    if (filled.has(r.row)) continue;
    SOURCE_COLUMNS.forEach((_, i) => {
      sheet.getCell(r.row, 6 + i).value = "-";
    });
  }

  // A53:B63, all channels by source. From the CMS-wide Revenue source export when there is
  // one. Without it (a month built from the template): Total = the CMS channel export's
  // Total row, each source = the sum of the channel rows on the right (F–O, 53–76).
  if (accountSources || isTemplate) {
    const cmsTotal =
      cmsZip && cmsZip.own
        ? Number(
            ((await csvFrom(JSZip, cmsZip.data, "Table data.csv")) || "")
              .split(/\r?\n/)
              .find((l) => l.startsWith("Total,"))
              ?.split(",")
              .pop(),
          )
        : NaN;
    for (let r = 53; r <= 53 + SOURCE_COLUMNS.length; r++) {
      const label = text(sheet.getCell(r, 1).value);
      if (!label) continue;
      const cell = sheet.getCell(r, 2);
      const i = SOURCE_COLUMNS.findIndex((s) => s.toLowerCase() === label.toLowerCase());
      if (accountSources) cell.value = label in accountSources ? accountSources[label] : null;
      else if (label === "Total" && Number.isFinite(cmsTotal)) cell.value = cmsTotal;
      else if (label === "Total") mark(cell);
      else if (i >= 0) cell.value = { formula: `SUM(${String.fromCharCode(70 + i)}53:${String.fromCharCode(70 + i)}76)` };
      else mark(cell);
    }
    if (!accountSources) {
      const own = cmsZip && cmsZip.own ? cmsZip.name : "-";
      sheet.getCell("C52").value = `Total จาก ${own} · ประเภทอื่น = ผลรวมตารางรายช่อง (F–${String.fromCharCode(64 + LAST)} แถว 53–76)`;
      report.push(`B53 Total ← ${own === "-" ? "(ไม่มีไฟล์ CMS: ต้องกรอกเอง)" : own} · B54–B63 = ผลรวมจากตารางรายช่อง (ไม่มีไฟล์ Revenue source ทั้ง CMS)`);
    }
  }

  // The TERO DIGITAL channel is split above into TERO Digital + ถกไม่เถียง + เงินทองของจริง by
  // their own clips. The same lines here take Ads, Premium and Total from the export as they
  // are (the API's own numbers per line, nothing worked out here). The other sources exist
  // only for the whole channel (the API does not split them by clip): ถกไม่เถียง and
  // เงินทองของจริง keep "-", TERO Digital keeps the channel's file numbers.
  const SPLIT = ["TERO Digital", "ถกไม่เถียง", "เงินทองของจริง"];
  const fromApi = new Map<number, number>();
  for (const r of rows) {
    if (!SPLIT.includes(r.name)) continue;
    const v = [ADS, PREMIUM, TOTAL].map((h) => get(r.name, h));
    if (!v.every((x) => typeof x === "number")) continue;
    sheet.getCell(r.row, 6).value = v[0];
    sheet.getCell(r.row, 7).value = v[1];
    fromApi.set(r.row, v[2] as number);
    filled.add(r.row);
  }
  if (fromApi.size) {
    sheet.getCell(52, LAST + 3).value = "หมายเหตุ";
    for (const r of rows) {
      if (!fromApi.has(r.row)) continue;
      sheet.getCell(r.row, LAST + 3).value =
        r.name === "TERO Digital"
          ? "F, G, Total ส่วนที่เหลือของช่อง จาก YouTube Analytics API · H–P ทั้งช่อง TERO DIGITAL ตามไฟล์ Studio"
          : "F, G, Total คลิปของรายการ จาก YouTube Analytics API · แหล่งอื่น API ไม่แยกตามคลิป";
    }
    report.push(`แถว ${[...fromApi.keys()].join(", ")} (${SPLIT.join(" / ")}): Ads, Premium, Total ← ${exportFile}`);
  }

  // Q: the export's Total as is (YouTube Studio's sources overlap: their sum is not the total),
  // or the API's for the split lines. R: Ad + Premium against the table above.
  sheet.getCell(52, LAST + 1).value = "Total ตามไฟล์ Studio (USD)";
  sheet.getCell(52, LAST + 2).value = "Ad + Premium − ตารางบน (USD)";
  for (const r of rows) {
    if (!filled.has(r.row)) continue;
    sheet.getCell(r.row, LAST + 1).value = fromApi.get(r.row) ?? totals.get(r.row) ?? null;
    // Without the API numbers TERO Digital's row is still the whole channel: against all three lines.
    const names = r.name === "TERO Digital" && !fromApi.has(r.row) ? SPLIT : [r.name];
    const ups = names.map((n) => upper.get(n)).filter(Boolean) as { row: number }[];
    if (ups.length === names.length) sheet.getCell(r.row, LAST + 2).value = { formula: `F${r.row}+G${r.row}-(${ups.map((u) => `K${u.row}+L${u.row}`).join("+")})` };
  }
  // Widths only: the cells keep the sheet's number format (setting numFmt here would also
  // change every cell that shares the style).
  for (const c of [LAST + 1, LAST + 2]) sheet.getColumn(c).width = Math.max(sheet.getColumn(c).width || 0, 22);

  // Fixes asked for: O30 like the other rows; Summary back on the month sheet.
  const o30 = sheet.getCell("O30");
  if (o30.formula && !o30.formula.includes("$M$31")) {
    o30.value = { formula: "M30*3/$M$31" };
    report.push("แก้ O30 เป็น =M30*3/$M$31 (เดิมใช้ตัวเลขตายตัว)");
  }
  const summary = wb.getWorksheet("Summary");
  if (summary) {
    let linked = 0;
    for (let r = 2; r <= 25; r++) {
      const name = text(summary.getCell(r, 1).value);
      const src = r + 5;
      if (name !== text(sheet.getCell(src, 1).value)) {
        report.push(`Summary แถว ${r} "${name}" ไม่ตรงกับ ${sheet.name} แถว ${src} — ไม่ได้แก้แถวนี้`);
        continue;
      }
      for (let c = 2; c <= 16; c++) {
        const col = String.fromCharCode(64 + c + 1);
        summary.getCell(r, c).value = { formula: `'${sheet.name}'!${col}${src}` };
      }
      linked++;
    }
    report.push(`Summary: เชื่อมไปที่ ${sheet.name} ${linked} แถว`);
  }

  const now = input.now || new Date();
  sheet.getCell("A51").value = `Revenue source จาก YouTube Studio (${input.zips.filter((f) => parseZipName(f.name)).length} ไฟล์) · สร้างด้วย scripts/acc-revenue-sources.mjs เมื่อ ${now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`;

  // A template's own month tabs (another month's Update Report_…) do not belong in this month.
  if (isTemplate) for (const ws of [...wb.worksheets]) if (/^Update Report_/i.test(ws.name)) wb.removeWorksheet(ws.id);
  addUpdateReport(wb, sheet, report);

  // Formulas keep only themselves: the saved results are the template's (or the old
  // inputs'), and a viewer that does not recalculate would show them as this month's.
  wb.eachSheet((ws: any) =>
    ws.eachRow((row: any) =>
      row.eachCell((cell: any) => {
        const v = cell.value;
        if (!v || typeof v !== "object") return;
        if (v.sharedFormula) cell.value = { sharedFormula: v.sharedFormula };
        else if (v.formula) cell.value = { formula: v.formula, ...(v.ref ? { ref: v.ref, shareType: v.shareType } : {}) };
      }),
    ),
  );
  wb.calcProperties.fullCalcOnLoad = true;
  const buf = await wb.xlsx.writeBuffer();
  const data = buf instanceof ArrayBuffer ? buf : (buf as Uint8Array).buffer.slice((buf as Uint8Array).byteOffset, (buf as Uint8Array).byteOffset + (buf as Uint8Array).byteLength);
  const numOrNull = (v: any): number | null => (typeof v === "number" ? v : v && typeof v === "object" && typeof v.result === "number" ? v.result : null);
  const channels: ChannelSources[] = rows.map((r) => ({
    name: r.name.trim(),
    sources: Object.fromEntries(SOURCE_COLUMNS.map((s, i) => [s, numOrNull(sheet.getCell(r.row, 6 + i).value)])),
    total: numOrNull(sheet.getCell(r.row, LAST + 1).value),
    splitFromTeroDigital: r.name.trim() !== "TERO Digital" && SPLIT.includes(r.name.trim()),
  }));
  return { data: data as ArrayBuffer, fileName: bookName.replace(/\.xlsx$/i, " (generated).xlsx"), report, filled: filled.size, rows: rows.length, channels };
}

/**
 * "Update Report_<month>" tab: the Revenue source table (rows 53–76, D–Q) copied to the top as a
 * report of its own, laid out and coloured like the month sheet (one row higher): A–B channel,
 * C–M revenue by source, N the Studio Total, O W/T shared by N, P THB; total in row 30, the
 * AdSense box and the notes below. What is typed by hand stays on the month sheet: the cells
 * here point at it. The month sheet keeps its own copy of the table (rows 51–77).
 */
function addUpdateReport(wb: any, sheet: any, report: string[]) {
  const name = `Update ${sheet.name}`.slice(0, 31);
  const old = wb.getWorksheet(name);
  if (old) wb.removeWorksheet(old.id);
  const up = wb.addWorksheet(name, { views: [{ zoomScale: 90 }] });
  const ref = (a: string) => `'${sheet.name}'!${a}`;
  // The month sheet's "type this in" yellow (mark) is not carried over: nothing is typed here.
  const copy = (from: any, to: any, value: any = from.value) => {
    const typed = from.fill?.fgColor?.argb === TYPED;
    to.style = { ...from.style, ...(typed ? { fill: { type: "pattern", pattern: "none" } } : {}) };
    to.value = value;
  };
  const PINK = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2DCDB" } };
  const RED = { ...(sheet.getCell("A6").font || {}), bold: true, color: { argb: "FFFF0000" } };
  const n = SOURCE_COLUMNS.length; // C … (C + n − 1), then N, O, P
  const cTotal = 3 + n;
  const cWt = cTotal + 1;
  const cThb = cTotal + 2;
  const L = (c: number) => String.fromCharCode(64 + c);
  // Title and the month, styled as on the month sheet.
  for (let r = 1; r <= 4; r++) up.getRow(r).height = sheet.getRow(r).height;
  copy(sheet.getCell("A2"), up.getCell("A2"), text(sheet.getCell("A2").value));
  up.mergeCells(`A2:${L(cThb)}2`);
  copy(sheet.getCell("N4"), up.getCell("A4"), text(sheet.getCell("N4").value));
  up.mergeCells(`A4:${L(cThb)}4`);
  up.getCell("A4").alignment = { horizontal: "center" };
  // Headings (row 5).
  up.getRow(5).height = sheet.getRow(6).height;
  const heads = ["Channel Display Name", "Asset Channel ID", ...SOURCE_COLUMNS, "Total ตามไฟล์ Studio (USD)", "Deduct W/T (USD)", "THB"];
  heads.forEach((h, i) => {
    const cell = up.getCell(5, 1 + i);
    copy(sheet.getCell("A6"), cell, h);
    if (1 + i >= cWt) cell.style = { ...cell.style, fill: PINK, font: RED };
  });
  // Channels (rows 6–29) = rows 53–76 here; the colour of the same channel's line on the month sheet.
  for (let r = 53; r <= 76; r++) {
    const to = r - 47;
    const line = sheet.getRow(r - 46); // the month sheet: same channel
    up.getRow(to).height = line.height;
    copy(line.getCell(1), up.getCell(to, 1), text(sheet.getCell(r, 4).value));
    copy(line.getCell(2), up.getCell(to, 2), text(sheet.getCell(r, 5).value));
    for (let i = 0; i <= n; i++) {
      const v = sheet.getCell(r, 6 + i).value;
      copy(line.getCell(11), up.getCell(to, 3 + i), v && typeof v === "object" ? null : v);
    }
    copy(line.getCell(14), up.getCell(to, cWt), { formula: `${L(cTotal)}${to}*($B$42/${L(cTotal)}$30)` });
    // W/T (B42) is typed as a negative number, so O is too: THB = (Total + O) × rate, and the
    // column adds up to B43 × B40 like the notes below.
    copy(line.getCell(17), up.getCell(to, cThb), { formula: `(${L(cTotal)}${to}+${L(cWt)}${to})*$B$40` });
    for (const c of [cWt, cThb]) up.getCell(to, c).style = { ...up.getCell(to, c).style, fill: PINK };
  }
  // Total (row 30), styled like the month sheet's row 31.
  up.getRow(30).height = sheet.getRow(31).height;
  for (let c = 1; c <= cThb; c++) {
    const src = sheet.getCell(31, c <= 2 ? c : c >= cWt ? (c === cWt ? 14 : 17) : 11);
    copy(src, up.getCell(30, c), c <= 2 ? "รวม" : { formula: `SUM(${L(c)}6:${L(c)}29)` });
  }
  up.mergeCells("A30:B30");
  // AdSense box and notes (rows 34–49): labels and styles of the month sheet; typed numbers
  // point at the month sheet, so they are typed once.
  for (let r = 34; r <= 49; r++) {
    up.getRow(r).height = sheet.getRow(r).height;
    copy(sheet.getCell(r, 1), up.getCell(r, 1));
    const v = sheet.getCell(r, 2).value;
    copy(sheet.getCell(r, 2), up.getCell(r, 2), typeof v === "string" ? v : null);
  }
  const b = (a: string, value: unknown) => (up.getCell(a).value = value);
  b("B35", { formula: ref("B35") });
  b("B36", { formula: ref("B36") });
  b("B37", { formula: "SUM(B35:B36)" });
  up.getCell("A40").style = { ...up.getCell("A41").style, fill: PINK, font: { ...(up.getCell("A41").font || {}), color: { argb: "FFFF0000" } } };
  b("A40", "Exchange Rate");
  up.getCell("B40").style = { ...sheet.getCell("M5").style, fill: PINK };
  b("B40", { formula: ref("M5") });
  b("B41", { formula: `${L(cTotal)}30` });
  b("B42", { formula: ref("B42") });
  b("B43", { formula: "SUM(B41:B42)" });
  b("B44", { formula: ref("B44") });
  b("B45", { formula: "SUM(B43:B44)" });
  b("B47", { formula: "B45*B40" });
  b("B48", { formula: ref("B48") });
  b("B49", { formula: "SUM(B47:B48)" });
  // Yellow as in the example: these are the month's typed numbers (typed on the month sheet).
  for (const a of ["B35", "B36", "B42", "B44", "B48"]) up.getCell(a).style = { ...up.getCell(a).style, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } } };
  for (const a of ["A42", "A44", "A48"]) up.getCell(a).font = { ...(up.getCell(a).font || {}), color: { argb: "FFFF0000" } };
  // Widths: A–B as on the month sheet, the numbers a little wider for their headings.
  up.getColumn(1).width = sheet.getColumn(1).width;
  up.getColumn(2).width = sheet.getColumn(2).width;
  for (let c = 3; c <= cThb; c++) up.getColumn(c).width = c === cTotal ? 18 : 15;
  report.push(`แท็บ "${name}": ตาราง Revenue source (แถว 53–76) แบบรายงาน · ช่องที่กรอกเอง (อัตราแลกเปลี่ยน, W/T, AdSense, ค่าธรรมเนียม) ดึงจากแท็บ ${sheet.name}`);
}

// ---------- the checklist: what the month folder has, before anything is built ----------

export interface FolderFile {
  /** Path inside the picked folder: "10/Revenue source … .zip" or "Revenue source … .zip". */
  path: string;
  name: string;
  lastModified: number;
}

export type CheckLevel = "ok" | "warn" | "error";
export interface CheckItem {
  level: CheckLevel;
  text: string;
  detail?: string[];
}

export interface FolderPlan {
  /** This month's workbook, or the template (another month's). */
  book: FolderFile | null;
  isTemplate: boolean;
  zips: FolderFile[];
  channelCms: FolderFile | null;
  channelCmsOwn: boolean;
  exportFile: FolderFile | null;
}

/** Which files of the folder this month uses. `files` = the month folder, or the year folder with month subfolders. */
export function planFolder(files: FolderFile[], year: string, month: string): FolderPlan {
  const dirOf = (f: FolderFile) => (f.path.includes("/") ? f.path.split("/").slice(-2, -1)[0] : "");
  const inMonth = (f: FolderFile) => dirOf(f) === month || dirOf(f) === "";
  const own = files.filter(inMonth);
  const ofMonth = (f: FolderFile) => {
    const m = f.name.match(ANY_BOOK);
    return m && m[1] === year && m[2] === month;
  };
  // This month's workbook: as typed by the team, else the one this report made before (its typed
  // cells are kept: it is updated, not rebuilt from a template).
  const book = own.find((f) => BOOK.test(f.name) && ofMonth(f)) || own.find((f) => ANY_BOOK.test(f.name) && ofMonth(f)) || null;
  // Template: a workbook picked by hand ("template/…"), else the latest month before this one
  // (any other month when there is none before), the team's own file before a generated one.
  const rank = (f: FolderFile) => `${dirOf(f) < month ? "1" : "0"}${dirOf(f)}${BOOK.test(f.name) ? "1" : "0"}`;
  const template = book
    ? null
    : files.find((f) => f.path.startsWith("template/") && /\.xlsx$/i.test(f.name)) ||
      files
        .filter((f) => !inMonth(f) && /^\d{2}$/.test(dirOf(f)) && ANY_BOOK.test(f.name))
        .sort((x, y) => rank(x).localeCompare(rank(y)))
        .pop() ||
      null;
  const cmsOwn = own.find((f) => CHANNEL_CMS.test(f.name)) || null;
  const cmsOther = cmsOwn
    ? null
    : files
        .filter((f) => !inMonth(f) && /^\d{2}$/.test(dirOf(f)) && CHANNEL_CMS.test(f.name))
        .sort((x, y) => x.path.localeCompare(y.path))
        .pop() || null;
  return {
    book: book || template,
    isTemplate: !book && !!template,
    zips: own.filter((f) => !!parseZipName(f.name)),
    channelCms: cmsOwn || cmsOther,
    channelCmsOwn: !!cmsOwn,
    exportFile: own.find((f) => EXPORT_FILE.test(f.name)) || null,
  };
}

/** Channel rows that never have a Revenue source file of their own (not in the CMS, or split from TERO DIGITAL). */
const NO_FILE = (r: SheetRow) => !r.id || r.id === "TERO DIGITAL" || /brainchild|performance course/i.test(r.name);

const thDate = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

/**
 * Plain checks before building: ❌ stops the run, ⚠️ only warns. `channels` = the workbook's
 * channel rows (D53:E76), `cms` = channel title → ID, `hasAccData` = Monthly ACC has the month.
 */
export function checkFolder(plan: FolderPlan, year: string, month: string, channels: BookChannel[] | null, cms: Map<string, string>, hasAccData: boolean, now = new Date()): { items: CheckItem[]; canRun: boolean } {
  const items: CheckItem[] = [];
  const monthStart = `${year}-${month}-01`;
  // Workbook.
  if (!plan.book) items.push({ level: "error", text: `ต้องมีไฟล์ Report Earning ของเดือนก่อนเป็นแม่แบบ (เดือนใหม่ยังไม่มีไฟล์ของตัวเอง ปุ่มนี้จะสร้างให้)`, detail: [`ทางที่ 1: เลือกโฟลเดอร์ปี ACC Report\\${year} แทนโฟลเดอร์เดือน ระบบหาไฟล์เดือนก่อนเอง`, "ทางที่ 2: กด \"เลือกไฟล์เดือนก่อน\" แล้วเลือกไฟล์ Report Earning ไฟล์ไหนก็ได้ (รวมไฟล์ (generated))"] });
  else if (plan.isTemplate) items.push({ level: "ok", text: `สร้างไฟล์เดือนนี้ใหม่ โดยใช้ ${plan.book.path.replace(/^template\//, "")} เป็นแม่แบบ`, detail: ["ตัวเลขเดือนก่อนถูกล้าง · ช่องที่ต้องกรอกเองจะเป็นสีเหลือง"] });
  else items.push({ level: "ok", text: `ไฟล์ Report Earning ของเดือนนี้: ${plan.book.name}`, ...(/generated/i.test(plan.book.name) ? { detail: ["ไฟล์ที่ปุ่มนี้สร้างไว้: อัปเดตตัวเลขจากไฟล์ใหม่ ช่องที่กรอกเองไว้แล้วยังอยู่"] } : {}) });
  // Monthly ACC numbers.
  if (!hasAccData) items.push({ level: plan.isTemplate ? "error" : "warn", text: `Monthly ACC ยังไม่มีข้อมูลเดือน ${year}-${month}`, detail: [plan.isTemplate ? "ใช้แม่แบบต้องมีตัวเลขช่องจาก Monthly ACC" : "Total Earnings จะเป็น Ads + Premium"] });
  else items.push({ level: "ok", text: "ตัวเลขรายช่อง (Ads, Premium, Total) ใช้ข้อมูล Monthly ACC ในหน้านี้ ไม่ต้องเตรียมไฟล์" });
  // Channel IDs.
  if (!plan.channelCms) items.push({ level: "warn", text: "ไม่มีไฟล์ Channel … CMS.zip: จับคู่ช่องด้วยชื่ออย่างเดียว" });
  else if (!plan.channelCmsOwn) items.push({ level: "ok", text: `Channel ID จาก ${plan.channelCms.path} (ID ไม่เปลี่ยนตามเดือน)` });
  else items.push({ level: "ok", text: `Channel ID: ${plan.channelCms.name}` });
  // Revenue source zips.
  const zips = plan.zips.map((f) => ({ f, z: parseZipName(f.name)! }));
  const cmsWide = zips.filter((x) => /\bCMS\b/i.test(x.z.channel));
  const perChannel = zips.filter((x) => !/\bCMS\b/i.test(x.z.channel));
  if (!zips.length) items.push({ level: "error", text: "ยังไม่มีไฟล์ Revenue source (.zip) ในโฟลเดอร์เดือนนี้", detail: [`YouTube Studio → Analytics → รายได้ → แหล่งรายได้ (Revenue source) → ช่วง 1–สิ้นเดือน → Export → ดาวน์โหลด .zip ของแต่ละช่อง`] });
  if (channels) {
    const matched = new Map<number, string>();
    const unmatched: string[] = [];
    const dupes: string[] = [];
    for (const { f, z } of perChannel) {
      const m = matchRow(z.channel, channels, cms);
      if (!m) unmatched.push(f.name);
      else if (matched.has(m.row.row)) dupes.push(`${m.row.name}: ${f.name}`);
      else matched.set(m.row.row, f.name);
    }
    const need = channels.filter((r) => !NO_FILE(r));
    // A channel that had a file last time must have one now; one that had none ("-") only warns.
    const missing = need.filter((r) => !matched.has(r.row) && r.hadFile);
    const quiet = need.filter((r) => !matched.has(r.row) && !r.hadFile);
    if (zips.length) {
      if (missing.length) items.push({ level: "error", text: `ยังไม่มีไฟล์ของ ${missing.length} ช่อง (มีแล้ว ${matched.size} จาก ${need.length - quiet.length})`, detail: missing.map((r) => r.name) });
      else items.push({ level: "ok", text: `Revenue source ครบ ${need.length - quiet.length} ช่อง` });
      if (quiet.length) items.push({ level: "warn", text: `ไม่มีไฟล์ของ ${quiet.length} ช่องที่เดือนก่อนก็ไม่มี (ใส่ "-")`, detail: quiet.map((r) => r.name) });
    }
    if (unmatched.length) items.push({ level: "warn", text: `${unmatched.length} ไฟล์ไม่ตรงกับช่องในรายงาน (จะไม่ได้ใส่)`, detail: unmatched });
    if (dupes.length) items.push({ level: "warn", text: `${dupes.length} ช่องมีไฟล์ซ้ำ ใช้ไฟล์แรก`, detail: dupes });
    const noFile = channels.filter(NO_FILE).map((r) => r.name);
    if (noFile.length) items.push({ level: "ok", text: `ไม่ต้องมีไฟล์: ${noFile.join(", ")}`, detail: ["ไม่อยู่ใน CMS หรือแยกจากช่อง TERO DIGITAL: ใช้ตัวเลขจาก Monthly ACC หรือกรอกเอง"] });
  }
  if (cmsWide.length) items.push({ level: "ok", text: `Revenue source ทั้ง CMS: ${cmsWide[0].f.name}` });
  else if (zips.length) items.push({ level: "warn", text: "ไม่มี Revenue source ทั้ง CMS (TERO DIGITAL CMS.zip): ตารางซ้ายจะเป็นผลรวมของรายช่อง" });
  // Period and freshness.
  const wrong = zips.filter((x) => x.z.start !== monthStart);
  if (wrong.length) items.push({ level: "warn", text: `${wrong.length} ไฟล์ไม่ใช่ช่วงเดือน ${year}-${month}`, detail: wrong.map((x) => `${x.f.name} (${x.z.start} ถึง ${x.z.end})`) });
  const nextMonth = new Date(Date.UTC(Number(year), Number(month), 1));
  const settled = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), 15));
  const early = zips.filter((x) => x.f.lastModified && x.f.lastModified < settled.getTime());
  if (early.length) items.push({ level: "warn", text: `${early.length} ไฟล์ดาวน์โหลดก่อน ${thDate(settled)}: YouTube อาจยังปรับตัวเลข`, detail: early.map((x) => `${x.f.name} (${thDate(new Date(x.f.lastModified))})`) });
  if (now.getTime() < settled.getTime()) items.push({ level: "warn", text: `ยังไม่ถึง ${thDate(settled)}: ตัวเลขของเดือนนี้อาจยังไม่นิ่ง` });
  const copies = plan.zips.filter((f) => /\(\d+\)\.zip$/i.test(f.name));
  if (copies.length) items.push({ level: "warn", text: `${copies.length} ไฟล์มี " (1)" ในชื่อ (ดาวน์โหลดซ้ำ): ตรวจว่าไม่ซ้ำกับไฟล์เดิม`, detail: copies.map((f) => f.name) });
  // Typed by hand afterwards.
  items.push({ level: "warn", text: "หลังได้ไฟล์ต้องกรอกเองในแท็บ Report_: อัตราแลกเปลี่ยน (M5), W/T (N5, B42), AdSense (B35–B36), Bank charge (B44), Processing fee (B48)" });
  return { items, canRun: !items.some((i) => i.level === "error") };
}
