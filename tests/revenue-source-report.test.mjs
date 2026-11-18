import test from "node:test";
import assert from "node:assert/strict";
import { checkFolder, planFolder } from "../lib/dashboard/revenueSourceReport.ts";

const f = (path, lastModified = Date.UTC(2026, 10, 16)) => ({ path, name: path.split("/").pop(), lastModified });
const zip = (ch) => f(`10/Revenue source 2026-10-01_2026-11-01 ${ch}.zip`);
const channels = [
  { row: 53, name: "Alpha", id: "AAAAAAAAAAAA1", hadFile: true },
  { row: 54, name: "Beta", id: "BBBBBBBBBBBB2", hadFile: true },
  { row: 55, name: "Quiet", id: "CCCCCCCCCCCC3", hadFile: false },
  { row: 56, name: "ถกไม่เถียง", id: "TERO DIGITAL", hadFile: true },
];
const now = new Date(Date.UTC(2026, 10, 18));

test("the year folder: this month's files, another month's workbook as the template", () => {
  const plan = planFolder([f("09/Report Earning - Youtube - 2026 09.xlsx"), f("09/Channel 2026-09-01_2026-10-01 TERO DIGITAL CMS.zip"), zip("Alpha"), f("10/notes.txt")], "2026", "10");
  assert.equal(plan.book.path, "09/Report Earning - Youtube - 2026 09.xlsx");
  assert.equal(plan.isTemplate, true);
  assert.equal(plan.channelCmsOwn, false);
  assert.deepEqual(plan.zips.map((z) => z.name), ["Revenue source 2026-10-01_2026-11-01 Alpha.zip"]);
  // The month folder itself, with its own workbook.
  const own = planFolder([f("Report Earning - Youtube - 2026 10.xlsx"), f("Revenue source 2026-10-01_2026-11-01 Alpha.zip")], "2026", "10");
  assert.equal(own.isTemplate, false);
  assert.equal(own.zips.length, 1);
});

test("a channel that had a file last month must have one; quiet ones and split lines only warn", () => {
  const plan = planFolder([f("09/Report Earning - Youtube - 2026 09.xlsx"), zip("Alpha")], "2026", "10");
  const r = checkFolder(plan, "2026", "10", channels, new Map(), true, now);
  assert.equal(r.canRun, false);
  const err = r.items.find((i) => i.level === "error");
  assert.deepEqual(err.detail, ["Beta"]);
  assert.ok(r.items.some((i) => i.level === "warn" && i.detail?.includes("Quiet")));
  const ok = checkFolder(planFolder([f("09/Report Earning - Youtube - 2026 09.xlsx"), zip("Alpha"), zip("Beta")], "2026", "10"), "2026", "10", channels, new Map(), true, now);
  assert.equal(ok.canRun, true);
});

test("no workbook, no zips, no Monthly ACC for a template: cannot run", () => {
  assert.equal(checkFolder(planFolder([zip("Alpha")], "2026", "10"), "2026", "10", null, new Map(), true, now).canRun, false);
  assert.equal(checkFolder(planFolder([f("09/Report Earning - Youtube - 2026 09.xlsx")], "2026", "10"), "2026", "10", channels, new Map(), true, now).canRun, false);
  const plan = planFolder([f("09/Report Earning - Youtube - 2026 09.xlsx"), zip("Alpha"), zip("Beta")], "2026", "10");
  assert.equal(checkFolder(plan, "2026", "10", channels, new Map(), false, now).canRun, false);
});

test("early downloads, another period and a ' (1)' copy are warnings", () => {
  const early = f("10/Revenue source 2026-10-01_2026-10-12 Alpha (1).zip", Date.UTC(2026, 9, 12));
  const plan = planFolder([f("09/Report Earning - Youtube - 2026 09.xlsx"), early, zip("Beta")], "2026", "10");
  const r = checkFolder(plan, "2026", "10", channels, new Map(), true, now);
  assert.equal(r.canRun, true);
  const warns = r.items.filter((i) => i.level === "warn").map((i) => i.text).join(" | ");
  assert.match(warns, /ดาวน์โหลดก่อน/);
  assert.match(warns, /\(1\)/);
});

test("workbook names that differ from Studio's match without the CMS export", async () => {
  const { matchRow } = await import("../lib/dashboard/revenueSources.ts");
  const rows = ["TeroRadioChannel", "ครอบครัวข่าวเด็ก (Kids Fun)", "TV Series", "Variety", "Sports", "นครหลวงโปรโมชัน (NAKORNLOUNG Promotion)", "Krajokhokdan (กระจกหกด้าน)"].map((name, i) => ({ row: 53 + i, name, id: "" }));
  const studio = ["HITZ Thailand", "Kids Fun คิดฝัน", "TERO TV Series", "TERO Variety", "TERO Sports", "นครหลวงโปรโมชั่น", "กระจกหกด้าน _ Krajokhokdan Official"];
  assert.deepEqual(studio.map((s) => matchRow(s, rows, new Map())?.row.row), [53, 54, 55, 56, 57, 58, 59]);
  assert.equal(matchRow("TERO Sport", rows, new Map())?.row.name, "Sports");
});

test("a new month: last month's generated file is the template; a file picked by hand wins; this month's generated file is updated", () => {
  const gen = (m) => f(`${m}/Report Earning - Youtube - 2026 ${m} (generated).xlsx`);
  const nov = (ch) => f(`11/Revenue source 2026-11-01_2026-12-01 ${ch}.zip`);
  // Only generated files exist: October's is November's template (not a later month's).
  let plan = planFolder([gen("09"), gen("10"), gen("12"), nov("Alpha")], "2026", "11");
  assert.equal(plan.book.path, "10/Report Earning - Youtube - 2026 10 (generated).xlsx");
  assert.equal(plan.isTemplate, true);
  // The team's own file before a generated one of the same month.
  plan = planFolder([gen("10"), f("10/Report Earning - Youtube - 2026 10.xlsx"), nov("Alpha")], "2026", "11");
  assert.equal(plan.book.name, "Report Earning - Youtube - 2026 10.xlsx");
  // The month folder alone: no template until one is picked by hand.
  plan = planFolder([f("Revenue source 2026-11-01_2026-12-01 Alpha.zip")], "2026", "11");
  assert.equal(plan.book, null);
  const r = checkFolder(plan, "2026", "11", null, new Map(), true, now);
  assert.match(r.items[0].text, /เดือนก่อน/);
  plan = planFolder([f("Revenue source 2026-11-01_2026-12-01 Alpha.zip"), f("template/Youtube Report Earning - OCT.xlsx")], "2026", "11");
  assert.equal(plan.book.path, "template/Youtube Report Earning - OCT.xlsx");
  assert.equal(plan.isTemplate, true);
  // Run again in the same month: this month's generated file is the book, not a template.
  plan = planFolder([gen("10"), gen("11"), nov("Alpha")], "2026", "11");
  assert.equal(plan.book.path, "11/Report Earning - Youtube - 2026 11 (generated).xlsx");
  assert.equal(plan.isTemplate, false);
});
