"use client";
// รายได้ → Monthly ACC → "รายงาน Revenue source" (admins): the month's Report Earning workbook
// from YouTube Studio's Revenue source zips, made in this browser. The admin picks the ACC
// Report year folder; the page says what is there and what is missing, and builds only when
// nothing is missing. Files are read here and never uploaded; the result is a download.
// Same builder as scripts/acc-revenue-sources.mjs (lib/dashboard/revenueSourceReport.ts).
import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileDown, FolderOpen, Play, XCircle } from "lucide-react";
import { accSheetRows, type AccMonth } from "@/lib/dashboard/accMonthly";
import { buildRevenueReport, checkFolder, cmsChannelsOf, planFolder, workbookChannels, type CheckItem, type FolderFile, type FolderPlan } from "@/lib/dashboard/revenueSourceReport";
import { recordDownload } from "@/lib/auth/activity";
import { track } from "@/lib/loadingBar";
import { saveRevenueSourceMonth } from "@/lib/revenueSourcesData";
import { auth } from "@/lib/firebase";

type Picked = FolderFile & { file: File };
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });
const ICON = { ok: CheckCircle2, warn: AlertTriangle, error: XCircle } as const;

const libs = async () => {
  const [ExcelJS, JSZip] = await Promise.all([import("exceljs"), import("jszip")]);
  return { ExcelJS: (ExcelJS as { default?: unknown }).default || ExcelJS, JSZip: (JSZip as { default?: unknown }).default || JSZip };
};

/**
 * Paths as the year folder sees them: "10/<file>" for a month folder, "<file>" when the month
 * folder itself was picked. A picked ACC Report folder ("2026/10/…") keeps only this year.
 */
function toFolderFiles(list: FileList, year: string): Picked[] {
  const out: Picked[] = [];
  for (const file of Array.from(list)) {
    const parts = (file.webkitRelativePath || file.name).split("/").slice(1); // drop the picked folder's own name
    const y = parts.indexOf(year);
    const rest = y >= 0 ? parts.slice(y + 1) : parts.length > 2 ? null : parts;
    if (!rest || !rest.length || rest.length > 2) continue;
    out.push({ path: rest.join("/"), name: file.name, lastModified: file.lastModified, file });
  }
  // A year folder was picked: only files inside month folders count (not loose ones beside them).
  return out.some((f) => f.path.includes("/")) ? out.filter((f) => f.path.includes("/")) : out;
}

export function RevenueSourceReportPanel({ month, onClose }: { month: AccMonth | null; onClose: () => void }) {
  const [year, mm] = (month?.month || "").split("-");
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Picked[]>([]);
  const [folder, setFolder] = useState("");
  const [plan, setPlan] = useState<FolderPlan | null>(null);
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [canRun, setCanRun] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ fileName: string; report: string[]; filled: number; rows: number } | null>(null);

  const hasAcc = !!month && month.rows.some((r) => !r.missing);
  const byPath = (p: string | undefined) => files.find((f) => f.path === p)?.file;

  const check = async (list: Picked[]) => {
    setError("");
    setDone(null);
    setBusy("กำลังตรวจไฟล์…");
    try {
      const p = planFolder(list, year, mm);
      setPlan(p);
      const { ExcelJS, JSZip } = await libs();
      const book = p.book && list.find((f) => f.path === p.book!.path)!.file;
      const cmsFile = p.channelCms && list.find((f) => f.path === p.channelCms!.path)!.file;
      const channels = book ? await workbookChannels(ExcelJS, await book.arrayBuffer()) : null;
      const cms = cmsFile ? await cmsChannelsOf(JSZip, await cmsFile.arrayBuffer()) : new Map<string, string>();
      const r = checkFolder(p, year, mm, channels, cms, hasAcc);
      setItems(r.items);
      setCanRun(r.canRun);
    } catch (e) {
      setItems(null);
      setCanRun(false);
      setError(`อ่านไฟล์ไม่ได้: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy("");
    }
  };

  // A previous month's workbook picked by hand: the template when the folder has none.
  const templateInput = useRef<HTMLInputElement>(null);
  const onTemplate = (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    const picked = [...files.filter((f) => !f.path.startsWith("template/")), { path: `template/${file.name}`, name: file.name, lastModified: file.lastModified, file }];
    setFiles(picked);
    void check(picked);
  };

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    // Keep a template picked by hand.
    const picked = [...toFolderFiles(list, year), ...files.filter((f) => f.path.startsWith("template/"))];
    setFiles(picked);
    setFolder((list[0].webkitRelativePath || "").split("/")[0] || "");
    void check(picked);
  };

  const run = async () => {
    if (!plan?.book || !month || !canRun) return;
    setBusy("กำลังสร้างรายงาน…");
    setError("");
    try {
      const { ExcelJS, JSZip } = await libs();
      const buf = async (p?: string) => (await byPath(p)!.arrayBuffer()) as ArrayBuffer;
      const result = await track(
        buildRevenueReport({
          ExcelJS,
          JSZip,
          year,
          month: mm,
          book: { name: plan.book.name, data: await buf(plan.book.path) },
          isTemplate: plan.isTemplate,
          templateLabel: plan.book.path,
          exportRows: hasAcc ? accSheetRows(month, 1, "USD") : null,
          exportName: `Monthly ACC ${month.month} (ในระบบ)`,
          zips: await Promise.all(plan.zips.map(async (f) => ({ name: f.name, data: await buf(f.path) }))),
          channelCms: plan.channelCms ? { name: plan.channelCms.name, data: await buf(plan.channelCms.path), own: plan.channelCmsOwn, label: plan.channelCms.path } : null,
        }),
      );
      const url = URL.createObjectURL(new Blob([result.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      recordDownload("excel-revenue-source", result.fileName, 1);
      // Each channel's figures for YouTube Revenue (e.g. Shorts Feed ads per channel). The download
      // is done either way; a failed save is said, not thrown.
      let saved = "";
      try {
        await saveRevenueSourceMonth(month.month, result.channels, plan.zips.length, auth.currentUser?.email || "");
        saved = "บันทึกรายได้แยกแหล่งของแต่ละช่องลงระบบแล้ว (ใช้ในหน้า YouTube Revenue)";
      } catch {
        saved = "⚠️ บันทึกรายได้แยกแหล่งลงระบบไม่สำเร็จ (ไฟล์ดาวน์โหลดแล้ว)";
      }
      setDone({ ...result, report: [saved, ...result.report] });
    } catch (e) {
      setError(`สร้างรายงานไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy("");
    }
  };

  if (!month) return null;
  const errors = items?.filter((i) => i.level === "error").length || 0;

  return (
    <div className="acc-rs" role="dialog" aria-label="รายงาน Revenue source">
      <div className="acc-rs-head">
        <strong>
          <FileDown size={16} /> รายงาน Revenue source · {monthLabel(month.month)}
        </strong>
        <button type="button" className="acc-rs-close" onClick={onClose} aria-label="ปิด">
          ×
        </button>
      </div>
      <p className="acc-rs-sub">
        สร้างไฟล์ "Report Earning - Youtube - {year} {mm} (generated).xlsx" (แท็บ Report_ และ Update Report_) บนเครื่องนี้ · ไฟล์ไม่ถูกส่งขึ้นระบบ
      </p>

      <ol className="acc-rs-steps">
        <li>
          <b>เตรียมไฟล์ในโฟลเดอร์ ACC Report\{year}\{mm}</b>
          <ul>
            <li>
              <b>Revenue source ของทุกช่อง (.zip)</b> · YouTube Studio → Analytics → Revenue → Revenue sources → ช่วง 1–สิ้นเดือน → Export → ดาวน์โหลด
              <small> ดาวน์โหลดหลังวันที่ 15 ของเดือนถัดไป ตัวเลขจะนิ่งแล้ว · ไม่ต้องเปลี่ยนชื่อไฟล์</small>
            </li>
            <li>
              <b>Revenue source ทั้ง CMS</b> (TERO DIGITAL CMS.zip) <small>ไม่บังคับ · ใช้กับตารางรวมด้านซ้าย</small>
            </li>
            <li>
              <b>Channel … CMS.zip</b> <small>ไม่บังคับ · ไม่มีจะใช้ของเดือนก่อน</small>
            </li>
            <li>
              <b>Report Earning ของเดือนก่อน</b> <small>เดือนใหม่ไม่ต้องมีไฟล์ของตัวเอง ปุ่มนี้สร้างให้จากไฟล์เดือนก่อน (ไฟล์ (generated) ที่ปุ่มนี้สร้างก็ใช้ได้) · เลือกโฟลเดอร์ปีแล้วระบบหาเอง หรือกด "เลือกไฟล์เดือนก่อน"</small>
            </li>
            <li>
              <b>Monthly ACC</b> <small>ไม่ต้องเตรียม ใช้ข้อมูลในหน้านี้ {hasAcc ? "✓" : "(ยังไม่มีของเดือนนี้)"}</small>
            </li>
          </ul>
        </li>
        <li>
          <b>เลือกโฟลเดอร์ปี ACC Report\{year}</b> <small>(หรือโฟลเดอร์เดือน {mm} ถ้าไม่ต้องใช้แม่แบบจากเดือนก่อน)</small>
          <div className="acc-rs-row">
            <input
              ref={input}
              type="file"
              hidden
              multiple
              // @ts-expect-error: folder picking (Chrome, Edge, Firefox, Safari)
              webkitdirectory=""
              onChange={(e) => onPick(e.target.files)}
            />
            <button type="button" className="acc-export" disabled={!!busy} onClick={() => input.current?.click()}>
              <FolderOpen size={15} /> {folder ? "เลือกโฟลเดอร์ใหม่" : "เลือกโฟลเดอร์"}
            </button>
            <input ref={templateInput} type="file" hidden accept=".xlsx" onChange={(e) => onTemplate(e.target.files)} />
            <button
              type="button"
              className={folder && !plan?.book ? "acc-export" : "acc-rs-link"}
              disabled={!!busy || !folder}
              onClick={() => templateInput.current?.click()}
              title={!folder ? "เลือกโฟลเดอร์ก่อน" : "ใช้ไฟล์ Report Earning ของเดือนก่อนเป็นแม่แบบ"}
            >
              เลือกไฟล์เดือนก่อน
            </button>
            {folder && (
              <>
                <span className="acc-rs-folder">📁 {folder} · {files.filter((f) => !f.path.startsWith("template/")).length} ไฟล์{files.some((f) => f.path.startsWith("template/")) ? ` · แม่แบบ: ${files.find((f) => f.path.startsWith("template/"))!.name}` : ""}</span>
                <button type="button" className="acc-rs-link" disabled={!!busy} onClick={() => void check(files)}>
                  ตรวจอีกครั้ง
                </button>
              </>
            )}
          </div>
          <small>เบราว์เซอร์จะถามว่า "อัปโหลด" ไฟล์ไหม: เป็นแค่การอ่านไฟล์ในเครื่อง ไม่มีการส่งไฟล์ออกไป</small>
        </li>
        {items && (
          <li>
            <b>ผลตรวจ</b> {errors ? <span className="acc-rs-bad">ต้องแก้ {errors} ข้อก่อนสร้างรายงาน</span> : <span className="acc-rs-good">พร้อมสร้างรายงาน</span>}
            <ul className="acc-rs-check">
              {items.map((it, i) => {
                const Icon = ICON[it.level];
                return (
                  <li key={i} className={it.level}>
                    <Icon size={15} />
                    <div>
                      {it.text}
                      {it.detail && it.detail.length > 0 && (
                        <ul>
                          {it.detail.map((d) => (
                            <li key={d}>{d}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        )}
        <li>
          <b>สร้างรายงาน</b>
          <div className="acc-rs-row">
            <button type="button" className="acc-export" disabled={!canRun || !!busy} onClick={run} title={!items ? "เลือกโฟลเดอร์ก่อน" : !canRun ? "แก้ข้อที่มี ✗ ก่อน" : undefined}>
              <Play size={15} /> สร้างและดาวน์โหลด
            </button>
            {busy && <span className="acc-rs-folder">{busy}</span>}
          </div>
          {!items && <small>เลือกโฟลเดอร์ก่อน ระบบจะตรวจไฟล์ให้</small>}
          {items && !canRun && <small>ยังกดไม่ได้: แก้ข้อที่มี ✗ แล้วกด "ตรวจอีกครั้ง"</small>}
        </li>
      </ol>

      {error && <p className="acc-rs-bad">{error}</p>}
      {done && (
        <div className="acc-rs-done">
          <p className="acc-rs-good">
            ดาวน์โหลดแล้ว: {done.fileName} · ใส่ข้อมูล {done.filled} จาก {done.rows} ช่อง · วางไฟล์ไว้ในโฟลเดอร์ {mm} แล้วกรอกช่องสีเหลืองในแท็บ Report_
          </p>
          <details>
            <summary>รายละเอียดสิ่งที่ทำ ({done.report.length} บรรทัด)</summary>
            <ul>
              {done.report.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
