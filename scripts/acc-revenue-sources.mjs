// ACC report: the month's YouTube earnings workbook, on this PC.
//
//   node scripts/acc-revenue-sources.mjs "C:\Users\...\ACC Report\2026\09"
//
// The same report is made in the dashboard: รายได้ → Monthly ACC → "รายงาน Revenue source"
// (admins). Both use lib/dashboard/revenueSourceReport.ts; this reads the folder.
//
// Reads, in that month's folder:
//   Report Earning - Youtube - YYYY MM.xlsx      the workbook (never overwritten), or, when the
//                                                month has none yet: the latest other month's
//                                                workbook as a template + the dashboard export below
//   Monthly-ACC-YYYY-MM-USD.xlsx                 รายได้ → Monthly ACC → Export (USD): C–L for a template,
//                                                Total Earnings (M) for every month
//   Revenue source <start>_<end> <channel>.zip   one per channel (Table data.csv)
//   Channel ... CMS.zip (optional)               channel titles → IDs, to match rows by ID
// Writes "Report Earning - Youtube - YYYY MM (generated).xlsx" next to them (ACC_OUT: elsewhere,
// e.g. a trial run while the month's file is open in Excel). What goes where: see the module.
//
// Real revenue: the workbooks and the exports stay on this PC, never in the repo.
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { BOOK, buildRevenueReport, cmsChannelsOf, checkFolder, planFolder, workbookChannels } from "../lib/dashboard/revenueSourceReport.ts";

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('ใช้: node scripts/acc-revenue-sources.mjs "<โฟลเดอร์เดือน เช่น ...\\ACC Report\\2026\\09>"');
  process.exit(1);
}
const abs = path.resolve(dir);
const folderMonth = path.basename(abs);
const folderYear = path.basename(path.dirname(abs));
const files = fs.readdirSync(abs);
const own = files.find((f) => BOOK.test(f));
if (!own && (!/^\d{2}$/.test(folderMonth) || !/^\d{4}$/.test(folderYear))) {
  console.error("ไม่พบไฟล์ Report Earning - Youtube - YYYY MM.xlsx และชื่อโฟลเดอร์ไม่ใช่ ...\\YYYY\\MM");
  process.exit(1);
}
const [, year, month] = own ? own.match(BOOK) : [null, folderYear, folderMonth];

// The year folder as the dashboard sees it: "MM/<file>" for every month folder.
const parent = path.dirname(abs);
const listed = [];
for (const d of fs.readdirSync(parent)) {
  const p = path.join(parent, d);
  if (!/^\d{2}$/.test(d) || !fs.statSync(p).isDirectory()) continue;
  for (const f of fs.readdirSync(p)) listed.push({ path: `${d}/${f}`, name: f, lastModified: fs.statSync(path.join(p, f)).mtimeMs, full: path.join(p, f) });
}
if (!/^\d{2}$/.test(folderMonth)) for (const f of files) listed.push({ path: f, name: f, lastModified: fs.statSync(path.join(abs, f)).mtimeMs, full: path.join(abs, f) });
const plan = planFolder(listed, year, month);
if (!plan.book) {
  console.error("ไม่พบไฟล์ Report Earning ของเดือนอื่นที่จะใช้เป็นแม่แบบ");
  process.exit(1);
}
const read = (f) => fs.readFileSync(f.full);

// The dashboard's Monthly ACC export for this month (USD), as rows.
let exportRows = null;
if (plan.exportFile) {
  const ex = new ExcelJS.Workbook();
  await ex.xlsx.readFile(plan.exportFile.full);
  const sheet = ex.getWorksheet(`${year}-${month}`);
  if (!sheet) throw new Error(`ไฟล์ ${plan.exportFile.name} ไม่มีแท็บ ${year}-${month}`);
  const cellText = (v) => (v && typeof v === "object" ? (v.richText ? v.richText.map((t) => t.text).join("") : (v.result ?? v.text ?? "")) : (v ?? "")).toString().trim();
  const head = sheet.getRow(1).values.map(cellText);
  exportRows = [];
  sheet.eachRow((row, r) => {
    if (r === 1) return;
    const rec = {};
    head.forEach((h, i) => {
      if (!h) return;
      const v = row.getCell(i).value;
      rec[h] = v && typeof v === "object" && "result" in v ? v.result : v;
    });
    exportRows.push(rec);
  });
} else if (plan.isTemplate) {
  console.error(`ไม่พบไฟล์ Monthly-ACC-${year}-${month}-USD.xlsx (รายได้ → Monthly ACC → Export แบบ USD)`);
  process.exit(1);
}

// The checklist the dashboard shows, here as lines.
const cms = plan.channelCms ? await cmsChannelsOf(JSZip, read(plan.channelCms)) : new Map();
const { items } = checkFolder(plan, year, month, await workbookChannels(ExcelJS, read(plan.book)), cms, !!exportRows);
const ICON = { ok: "✓", warn: "⚠", error: "✗" };
console.log(items.map((i) => `${ICON[i.level]} ${i.text}${i.detail ? `\n    ${i.detail.join("\n    ")}` : ""}`).join("\n") + "\n");

const result = await buildRevenueReport({
  ExcelJS,
  JSZip,
  year,
  month,
  book: { name: plan.book.name, data: read(plan.book) },
  isTemplate: plan.isTemplate,
  templateLabel: plan.book.path.replace("/", "\\"),
  exportRows,
  exportName: plan.exportFile?.name || "",
  zips: plan.zips.map((f) => ({ name: f.name, data: read(f) })),
  channelCms: plan.channelCms ? { name: plan.channelCms.name, data: read(plan.channelCms), own: plan.channelCmsOwn, label: plan.channelCms.path.replace("/", "\\") } : null,
});
const out = process.env.ACC_OUT || path.join(abs, result.fileName);
fs.writeFileSync(out, Buffer.from(result.data));
// ACC_CHANNELS_JSON: also write each channel's figures (what the dashboard saves to revenueSources/{month}).
if (process.env.ACC_CHANNELS_JSON) fs.writeFileSync(process.env.ACC_CHANNELS_JSON, JSON.stringify({ month: `${year}-${month}`, files: plan.zips.length, channels: result.channels }));
console.log(result.report.join("\n"));
console.log(`\nใส่ข้อมูล ${result.filled} ช่อง · ไม่มีไฟล์ ${result.rows - result.filled} ช่อง (ใส่ "-")\nบันทึกที่: ${out}`);
