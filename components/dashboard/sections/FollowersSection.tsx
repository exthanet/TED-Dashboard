"use client";
// ผู้ติดตาม: every company account and its followers, grouped by platform or by show
// (รายการ), with the total and the online views of the last 12 months from masterData.
// Numbers come from accountStats (the daily sync); an account without an API shows the
// admin's typed number marked "รอตรวจสอบ". One table row per group; open a row for its accounts,
// click an account for a popup with its daily followers and a link; download the board as CSV.
import { Fragment, useEffect, useMemo, useState } from "react";
import { Activity, ChartLine, ChevronDown, Clapperboard, Download, ExternalLink, Eye, Heart, MessageCircle, Pencil, PlugZap, Settings, Share2, TriangleAlert, Users, X } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RecordRow } from "@/lib/dashboard/types";
import {
  PLATFORM_LABEL,
  SOCIAL_PLATFORMS,
  accountLogo,
  accountPosts,
  unlinkedPosts,
  accountYears,
  type YearRow,
  accountUrl,
  boardTotal,
  currentFollowers,
  followersOn,
  groupOf,
  shortCount,
  type AccountStat,
  type PostTotals,
  type SocialAccount,
  type SocialPlatform,
} from "@/lib/dashboard/socialAccounts";
import { loadAccountStats, loadSocialAccounts } from "@/lib/socialAccountsData";
import { dateLabel } from "@/lib/dashboard/format";
import { track } from "@/lib/loadingBar";
import { MediaKit } from "@/components/dashboard/sections/MediaKit";
import { PlatformMark } from "@/components/dashboard/shared/PlatformMark";

export const PLATFORM_COLOR: Record<SocialPlatform, string> = {
  facebook: "#1877f2",
  instagram: "#d62976",
  tiktok: "#111111",
  youtube: "#ff0000",
  x: "#111111",
  line: "#06c755",
  other: "#5f6b7a",
};
const PENDING = "รอตรวจสอบ";
const VIEW_KEY = "followers-view";
type View = "platform" | "group";

const full = (v: number) => v.toLocaleString("en-US");
/** "YouTube|" → "YouTube · ไม่มีชื่อช่อง", "Instagram|ถกไม่เถียง" → "Instagram · ถกไม่เถียง". */
const groupLabel = (key: string) => {
  const [platform, channel] = key.split("|");
  return `${platform} · ${channel && channel !== "-" ? channel : "ไม่มีชื่อช่อง"}`;
};
const dayTh = (d: string) => (d ? dateLabel(d) : "");
const initials = (name: string) => name.replace(/[^A-Za-z0-9ก-๙]/g, "").slice(0, 4).toUpperCase();

/** The uploaded logo or the brand page's Facebook picture; initials when there is none or it fails to load. */
function Logo({ a }: { a: SocialAccount }) {
  const [failed, setFailed] = useState(false);
  const src = accountLogo(a);
  return src && !failed ? (
    <img src={src} alt="" className="followers-logo" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  ) : (
    <span className="followers-logo text">{initials(a.name)}</span>
  );
}

export function sourceOf(a: SocialAccount, stat?: AccountStat): keyof typeof SOURCE_BADGE {
  if (a.source === "manual") return "manual";
  if (stat?.check) return "check";
  return stat?.chosen === "api" ? "api" : "metricool";
}

const SOURCE_BADGE = {
  api: { label: "API", title: "ดึงตรงจากแพลตฟอร์ม", Icon: PlugZap },
  metricool: { label: "Metricool", title: "จาก Metricool", Icon: ChartLine },
  check: { label: "ตรวจสอบ", title: "ตัวเลขจาก 2 แหล่งต่างกันเกิน 2%", Icon: TriangleAlert },
  manual: { label: PENDING, title: "ยังไม่ได้ต่อ API · ตัวเลขกรอกโดยผู้ดูแล", Icon: Pencil },
} as const;

/**
 * Posts, views and ER added across the accounts that have posts in the system (12 months);
 * null when none has. ER = (likes + comments + shares) ÷ views.
 */
function sumPosts(totals: (PostTotals | null)[]) {
  const have = totals.filter((t): t is PostTotals => !!t);
  if (!have.length) return null;
  const add = (k: "posts" | "views" | "likes" | "comments" | "shares") => have.reduce((a, t) => a + t[k], 0);
  const views = add("views");
  return { posts: add("posts"), views, er: views ? (add("likes") + add("comments") + add("shares")) / views : null };
}

interface Group {
  key: string;
  label: string;
  total: number;
  accounts: SocialAccount[];
}

/** Groups by platform or by show, the larger first; inside a group the larger account first. */
export function groupAccounts(accounts: SocialAccount[], stats: Record<string, AccountStat>, view: View): Group[] {
  const value = (a: SocialAccount) => currentFollowers(a, stats[a.id])?.value || 0;
  const map = new Map<string, Group>();
  for (const a of accounts) {
    const key = view === "platform" ? a.platform : groupOf(a);
    const label = view === "platform" ? PLATFORM_LABEL[a.platform] : groupOf(a);
    const g = map.get(key) || { key, label, total: 0, accounts: [] };
    g.total += value(a);
    g.accounts.push(a);
    map.set(key, g);
  }
  const groups = [...map.values()];
  for (const g of groups) g.accounts.sort((x, y) => value(y) - value(x));
  // Platforms keep their usual order when equal; shows go by size.
  return groups.sort((x, y) => y.total - x.total || SOCIAL_PLATFORMS.indexOf(x.key as SocialPlatform) - SOCIAL_PLATFORMS.indexOf(y.key as SocialPlatform));
}

export function FollowersSection({ rows, isAdmin, openSettings }: { rows: RecordRow[]; isAdmin: boolean; openSettings?: () => void }) {
  const [accounts, setAccounts] = useState<SocialAccount[] | null>(null);
  const [stats, setStats] = useState<Record<string, AccountStat>>({});
  const [error, setError] = useState("");
  const [picked, setPicked] = useState("");
  // Rows opened to show their accounts ("view:key"); all closed at first.
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "group" ? "group" : "platform";
    } catch {
      return "platform";
    }
  });
  const pickView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private window: the choice just isn't kept */
    }
  };

  useEffect(() => {
    track(Promise.all([loadSocialAccounts(), loadAccountStats()]))
      .then(([a, s]) => {
        setAccounts(a);
        setStats(s);
      })
      .catch((e) => setError(String(e?.message || e)));
  }, []);

  const shown = useMemo(() => (accounts || []).filter((a) => a.enabled), [accounts]);
  const groups = useMemo(() => groupAccounts(shown, stats, view), [shown, stats, view]);
  const total = useMemo(() => boardTotal(shown, stats), [shown, stats]);
  const pending = useMemo(() => shown.filter((a) => a.source === "manual"), [shown]);
  const pendingTotal = useMemo(() => boardTotal(pending, stats), [pending, stats]);
  const updated = useMemo(
    () =>
      shown
        .filter((a) => a.source !== "manual")
        .map((a) => stats[a.id]?.latest?.date || "")
        .filter(Boolean)
        .sort()
        .pop() || "",
    [shown, stats],
  );
  // Online views of the posts published in the last 12 months (as the deck's "views / year").
  const views12 = useMemo(() => {
    const days = rows.filter((r) => r.platform !== "TV").map((r) => r.date).sort();
    const last = days[days.length - 1] || "";
    if (!last) return 0;
    const from = new Date(Date.parse(`${last}T00:00:00Z`) - 365 * 86400000).toISOString().slice(0, 10);
    return rows.filter((r) => r.platform !== "TV" && r.date > from && r.date <= last).reduce((a, r) => a + (r.views || 0), 0);
  }, [rows]);

  const lastPostDay = useMemo(() => rows.filter((r) => r.platform !== "TV").map((r) => r.date).sort().pop() || "", [rows]);
  // The cards show the last 12 months (the popup compares calendar years).
  const posts12 = useMemo(() => {
    const from = lastPostDay ? new Date(Date.parse(`${lastPostDay}T00:00:00Z`) - 364 * 86400000).toISOString().slice(0, 10) : "";
    return new Map(shown.map((a) => [a.id, lastPostDay ? accountPosts(a, rows, from, lastPostDay) : null]));
  }, [rows, shown, lastPostDay]);
  // Posts of the same 12 months no account on the board covers: one more row, so the rows add up to the views card.
  const unlinked = useMemo(() => {
    if (!lastPostDay) return null;
    const from = new Date(Date.parse(`${lastPostDay}T00:00:00Z`) - 364 * 86400000).toISOString().slice(0, 10);
    return unlinkedPosts(shown, rows, from, lastPostDay);
  }, [rows, shown, lastPostDay]);

  const growth = (a: SocialAccount) => {
    const now = currentFollowers(a, stats[a.id]);
    if (!now || a.source === "manual") return null;
    const then = followersOn(stats[a.id], new Date(Date.parse(`${now.date}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10));
    return then === null ? null : now.value - then;
  };
  const pickedAccount = shown.find((a) => a.id === picked);
  const series = useMemo(
    () => (pickedAccount ? Object.entries(stats[pickedAccount.id]?.series || {}).sort().map(([date, value]) => ({ date, value })) : []),
    [pickedAccount, stats],
  );
  const pickedNow = pickedAccount ? currentFollowers(pickedAccount, stats[pickedAccount.id]) : null;
  const pickedGrowth = pickedAccount ? growth(pickedAccount) : null;
  const pickedYears = useMemo(
    () => (pickedAccount ? accountYears(pickedAccount, rows, stats[pickedAccount.id], lastPostDay || new Date().toISOString().slice(0, 10)) : []),
    [pickedAccount, rows, stats, lastPostDay],
  );

  return (
    <article className="panel full followers-board-panel" id="followers">
      <div className="panel-head">
        <div>
          <h2>ผู้ติดตาม</h2>
          <p>ผู้ติดตามของทุกบัญชี · ใช้ตัวเลขจาก API ของแพลตฟอร์มก่อน เทียบกับ Metricool ทุกวัน · “{PENDING}” = บัญชีที่ยังไม่ได้ต่อ API ตัวเลขกรอกโดยผู้ดูแล</p>
        </div>
        <div className="ranking-controls">
          <div className="segmented">
            <button className={view === "group" ? "active" : ""} onClick={() => pickView("group")}>
              จัดตามรายการ
            </button>
            <button className={view === "platform" ? "active" : ""} onClick={() => pickView("platform")}>
              จัดตามแพลตฟอร์ม
            </button>
          </div>
          {isAdmin && openSettings && (
            <button className="tv-add" onClick={openSettings}>
              <Settings size={14} /> ตั้งค่าบัญชี
            </button>
          )}
          <button className="tv-add" onClick={() => downloadCsv(groups, view, stats, growth, posts12)} disabled={!shown.length}>
            <Download size={14} /> ดาวน์โหลด CSV
          </button>
        </div>
      </div>

      {error && <p className="growth-notice warn">โหลดข้อมูลไม่สำเร็จ: {error}</p>}
      {accounts === null && !error && <p className="growth-notice">กำลังโหลด…</p>}
      {accounts && !shown.length && (
        <p className="growth-notice">ยังไม่มีบัญชี{isAdmin ? " · กด “ตั้งค่าบัญชี” แล้วเลือก “เริ่มจากรายการตั้งต้น”" : " · รอผู้ดูแลระบบตั้งค่า"}</p>
      )}

      {shown.length > 0 && (
        <div className="followers-board">
          <div className="followers-kpis">
            <div className="followers-kpi">
              <span className="followers-kpi-label">
                <Users size={16} aria-hidden="true" /> ผู้ติดตามรวม
              </span>
              <span className="followers-kpi-row">
                <strong>{shortCount(total)}</strong>
                {pending.length > 0 && (
                  <span className="followers-kpi-pill" title={`รวมตัวเลข${PENDING} ${full(pendingTotal)} คน`}>
                    {PENDING} {pending.length} บัญชี
                  </span>
                )}
              </span>
              <small>
                {full(total)} · {shown.length} บัญชี{updated ? ` · ข้อมูลถึง ${dayTh(updated)}` : ""}
              </small>
            </div>
            <div className="followers-kpi">
              <span className="followers-kpi-label">
                <Eye size={16} aria-hidden="true" /> วิวออนไลน์
              </span>
              <span className="followers-kpi-row">
                <strong>{shortCount(views12)}</strong>
              </span>
              <small>วิวของโพสต์ 12 เดือนล่าสุดในระบบ</small>
            </div>
          </div>

          <div className="followers-table-head">
            <h3>{view === "group" ? "ผู้ติดตามตามรายการ" : "ผู้ติดตามตามแพลตฟอร์ม"}</h3>
            <span className="followers-legend">
              {(Object.keys(SOURCE_BADGE) as (keyof typeof SOURCE_BADGE)[]).map((k) => (
                <span key={k} title={SOURCE_BADGE[k].title}>
                  <i className={`followers-src-dot ${k}`} /> {SOURCE_BADGE[k].label}
                </span>
              ))}
            </span>
          </div>
          <div className="followers-table">
            <table>
              <thead>
                <tr>
                  <th>{view === "group" ? "รายการ / บัญชี" : "แพลตฟอร์ม / บัญชี"}</th>
                  <th className="num">บัญชี</th>
                  <th className="num">ผู้ติดตาม</th>
                  <th className="num" title="ผู้ติดตามที่เพิ่มหรือลดใน 30 วัน (ไม่นับบัญชีที่กรอกเอง)">30 วัน</th>
                  <th className="num" title="โพสต์ใน 12 เดือนล่าสุด">โพสต์</th>
                  <th className="num" title="วิวของโพสต์ใน 12 เดือนล่าสุด">วิว</th>
                  <th className="num" title="(ไลก์ + คอมเมนต์ + แชร์) ÷ วิว">ER</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const isOpen = open.has(`${view}:${g.key}`);
                  const sum = sumPosts(g.accounts.map((a) => posts12.get(a.id) ?? null));
                  const grs = g.accounts.map(growth).filter((v): v is number => v !== null);
                  const gGrowth = grs.length ? grs.reduce((a, v) => a + v, 0) : null;
                  return (
                    <Fragment key={g.key}>
                      <tr className={`followers-row-group ${isOpen ? "open" : ""}`} onClick={() => toggle(`${view}:${g.key}`)}>
                        <td>
                          <button type="button" className="followers-toggle" aria-expanded={isOpen} aria-label={`${isOpen ? "ซ่อน" : "แสดง"}บัญชีของ ${g.label}`}>
                            <ChevronDown size={15} />
                          </button>
                          {view === "platform" ? (
                            <>
                              <PlatformMark platform={g.key} />
                              <b>{g.label}</b>
                            </>
                          ) : (
                            <>
                              {/* By show: the show's name first, then its platforms. */}
                              <b>{g.label}</b>
                              <span className="followers-marks">
                                {[...new Set(g.accounts.map((a) => a.platform))].map((p) => (
                                  <PlatformMark key={p} platform={p} size={13} />
                                ))}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="num">{g.accounts.length}</td>
                        <td className="num strong">{full(g.total)}</td>
                        <td className={`num ${gGrowth === null ? "muted" : gGrowth >= 0 ? "up" : "down"}`}>{gGrowth === null ? "–" : `${gGrowth >= 0 ? "+" : ""}${full(gGrowth)}`}</td>
                        <td className={`num ${sum ? "" : "muted"}`}>{sum ? full(sum.posts) : "–"}</td>
                        <td className={`num ${sum ? "" : "muted"}`}>{sum ? shortCount(sum.views) : "–"}</td>
                        <td className={`num ${sum?.er != null ? "" : "muted"}`}>{sum?.er != null ? `${(sum.er * 100).toFixed(1)}%` : "–"}</td>
                      </tr>
                      {isOpen &&
                        g.accounts.map((a) => {
                          const now = currentFollowers(a, stats[a.id]);
                          const gr = growth(a);
                          const problem = a.source !== "manual" && stats[a.id]?.error;
                          const p = posts12.get(a.id) ?? null;
                          const src = sourceOf(a, stats[a.id]);
                          return (
                            <tr
                              key={a.id}
                              className="followers-row-account"
                              tabIndex={0}
                              onClick={() => setPicked(a.id)}
                              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setPicked(a.id))}
                              title={problem || stats[a.id]?.check || "กดเพื่อดูผู้ติดตามรายวัน"}
                            >
                              <td>
                                <i className={`followers-src-dot ${src}`} title={SOURCE_BADGE[src].label} />
                                {view === "group" && <PlatformMark platform={a.platform} size={14} />}
                                <span className="followers-title">{a.name}</span>
                                {accountUrl(a) && (
                                  <a className="followers-open" href={accountUrl(a)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`เปิด ${a.name} บน ${PLATFORM_LABEL[a.platform]}`}>
                                    <ExternalLink size={12} />
                                  </a>
                                )}
                              </td>
                              <td className="num" />
                              <td className="num">{now ? full(now.value) : "–"}</td>
                              <td className={`num ${a.source === "manual" || gr === null ? "muted" : gr >= 0 ? "up" : "down"}`}>
                                {a.source === "manual" ? `กรอก ${dayTh(a.manualDate || "")}` : gr !== null ? `${gr >= 0 ? "+" : ""}${full(gr)}` : problem ? "ดึงไม่ได้" : "–"}
                              </td>
                              <td className={`num ${p ? "" : "muted"}`}>{p ? full(p.posts) : "–"}</td>
                              <td className={`num ${p ? "" : "muted"}`}>{p ? shortCount(p.views) : "–"}</td>
                              <td className={`num ${p?.er != null ? "" : "muted"}`}>{p?.er != null ? `${(p.er * 100).toFixed(1)}%` : "–"}</td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
                {unlinked && (
                  <tr
                    className="followers-row-unlinked"
                    title={["โพสต์ที่ไม่ตรงกับบัญชีไหนบนบอร์ด:", ...unlinked.by.map((b) => `${groupLabel(b.key)}: ${full(b.posts)} โพสต์ · ${shortCount(b.views)} วิว`)].join("\n")}
                  >
                    <td>
                      <span className="followers-toggle-space" />
                      <b>ยังไม่ผูกบัญชี</b>
                      <small>{unlinked.by.length === 1 ? groupLabel(unlinked.by[0].key) : `${unlinked.by.length} กลุ่ม · ชี้เพื่อดูรายละเอียด`}</small>
                    </td>
                    <td className="num muted">–</td>
                    <td className="num muted">–</td>
                    <td className="num muted">–</td>
                    <td className="num">{full(unlinked.posts)}</td>
                    <td className="num">{shortCount(unlinked.views)}</td>
                    <td className={`num ${unlinked.er != null ? "" : "muted"}`}>{unlinked.er != null ? `${(unlinked.er * 100).toFixed(1)}%` : "–"}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="followers-note">กดแถวเพื่อดูบัญชี · กดชื่อบัญชีเพื่อดูผู้ติดตามรายวันและเทียบรายปี · โพสต์ วิว และ ER นับโพสต์ 12 เดือนล่าสุดของบัญชีที่ sync โพสต์</p>
        </div>
      )}


      {shown.length > 0 && <MediaKit accounts={shown} stats={stats} rows={rows} total={total} views12={views12} />}

      {pickedAccount && (
        <div className="modal-backdrop" onClick={() => setPicked("")}>
          <section className="source-modal sync-modal followers-popup" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setPicked("")} aria-label="ปิด">
              <X size={18} />
            </button>
            <div className="sync-heading">
              <Logo a={pickedAccount} />
              <div>
                <h2>{pickedAccount.name}</h2>
                <p>
                  {PLATFORM_LABEL[pickedAccount.platform]} · {groupOf(pickedAccount)}
                  {pickedAccount.source === "manual" ? ` · ${PENDING} (ยังไม่ได้ต่อ API)` : pickedAccount.source === "youtube" ? " · YouTube API" : " · Metricool"}
                </p>
              </div>
            </div>
            <div className="followers-stats">
              <div>
                ผู้ติดตาม
                <b>{pickedNow ? full(pickedNow.value) : "–"}</b>
                {pickedNow ? dayTh(pickedNow.date) : ""}
              </div>
              {pickedGrowth !== null && (
                <div>
                  เพิ่มขึ้น 30 วัน
                  <b>{`${pickedGrowth >= 0 ? "+" : ""}${full(pickedGrowth)}`}</b>
                </div>
              )}
              {(() => {
                const p = posts12.get(pickedAccount.id);
                return p ? (
                  <div>
                    โพสต์ 12 เดือน
                    <b>{full(p.posts)}</b>
                    วิว {shortCount(p.views)} · ER {p.er === null ? "–" : `${(p.er * 100).toFixed(1)}%`}
                  </div>
                ) : null;
              })()}
              {(stats[pickedAccount.id]?.sources?.api || stats[pickedAccount.id]?.sources?.metricool) && (
                <div>
                  แหล่งข้อมูล
                  <b>{sourceOf(pickedAccount, stats[pickedAccount.id]) === "api" ? "API" : sourceOf(pickedAccount, stats[pickedAccount.id]) === "check" ? "ตรวจสอบ" : "Metricool"}</b>
                  {stats[pickedAccount.id]?.sources?.api && `API ${full(stats[pickedAccount.id]!.sources!.api!.value)}`}
                  {stats[pickedAccount.id]?.sources?.api && stats[pickedAccount.id]?.sources?.metricool && " · "}
                  {stats[pickedAccount.id]?.sources?.metricool && `Metricool ${full(stats[pickedAccount.id]!.sources!.metricool!.value)}`}
                </div>
              )}
              {series.length > 1 && (
                <div>
                  ข้อมูลย้อนหลัง
                  <b>{full(series.length)} วัน</b>
                  ตั้งแต่ {dayTh(series[0].date)}
                </div>
              )}
            </div>
            {stats[pickedAccount.id]?.check && <p className="growth-notice warn">{stats[pickedAccount.id]!.check} · แสดงตัวเลขจาก{stats[pickedAccount.id]?.chosen === "api" ? " API" : " Metricool"}</p>}
            <h3 className="followers-popup-title">ผู้ติดตามรายวัน</h3>
            {series.length > 1 ? (
              <div className="chart-md">
                <ResponsiveContainer>
                  <LineChart data={series}>
                    <CartesianGrid vertical={false} stroke="#e8edf5" />
                    <XAxis dataKey="date" tickFormatter={dateLabel} tick={{ fontSize: 11 }} minTickGap={30} />
                    <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => shortCount(Number(v))} domain={["auto", "auto"]} />
                    <Tooltip labelFormatter={(v) => dateLabel(String(v))} formatter={(v) => [full(Number(v)), "ผู้ติดตาม"]} />
                    <Line type="monotone" dataKey="value" stroke={PLATFORM_COLOR[pickedAccount.platform]} strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="ranking-empty">
                {pickedAccount.source === "manual" ? `${PENDING}: ยังไม่ได้ต่อ API · ตัวเลขกรอกเมื่อ ${dayTh(pickedAccount.manualDate || "")}` : "ยังมีข้อมูลไม่พอทำกราฟ"}
              </p>
            )}
            <h3 className="followers-popup-title">เทียบรายปี</h3>
            <YearTable years={pickedYears} hasPosts={posts12.get(pickedAccount.id) !== null} />
            <div className="tv-actions">
              {accountUrl(pickedAccount) ? (
                <a className="followers-link" href={accountUrl(pickedAccount)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={15} /> เปิดบัญชีบน {PLATFORM_LABEL[pickedAccount.platform]}
                </a>
              ) : (
                <span className="sync-muted">ยังไม่มีลิงก์บัญชี · ใส่ได้ในหน้าตั้งค่าบัญชีโซเชียล</span>
              )}
            </div>
          </section>
        </div>
      )}
    </article>
  );
}

const change = (a: number, b: number) => (b ? (a - b) / b : null);

/** Calendar years side by side; the change row compares per month, since a year may be only partly covered. */
function YearTable({ years, hasPosts }: { years: YearRow[]; hasPosts: boolean }) {
  if (!years.length) return <p className="ranking-empty">ยังไม่มีข้อมูลรายปี</p>;
  const [cur, prev] = years;
  const perMonth = (y: YearRow, k: "posts" | "views" | "likes" | "comments" | "shares") => (y.months ? y[k] / y.months : 0);
  const pctCell = (v: number | null) =>
    v === null ? <td>–</td> : <td className={v >= 0 ? "up" : "down"}>{`${v >= 0 ? "+" : ""}${Math.round(v * 100).toLocaleString("en-US")}%`}</td>;
  const erOf = (y: YearRow) => (y.er === null ? "–" : `${(y.er * 100).toFixed(2)}%`);
  return (
    <div className="followers-years">
      <table>
        <thead>
          <tr>
            <th>ปี</th>
            <th><Users size={13} aria-hidden="true" /> ผู้ติดตามสิ้นปี</th>
            {hasPosts && (
              <>
                <th><Clapperboard size={13} aria-hidden="true" /> โพสต์</th>
                <th><Eye size={13} aria-hidden="true" /> วิว</th>
                <th>วิว/เดือน</th>
                <th><Heart size={13} aria-hidden="true" /> ไลก์</th>
                <th><MessageCircle size={13} aria-hidden="true" /> คอมเมนต์</th>
                <th><Share2 size={13} aria-hidden="true" /> แชร์</th>
                <th><Activity size={13} aria-hidden="true" /> ER</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y.year}>
              <td>
                {y.year + 543}
                {hasPosts && <small>{y.months ? `${y.months} เดือน${y.months < 12 ? " ⚠️" : ""}` : "ไม่มีโพสต์"}</small>}
              </td>
              <td>{y.followersEnd === null ? "–" : full(y.followersEnd)}</td>
              {hasPosts && (
                <>
                  <td>{full(y.posts)}</td>
                  <td>{shortCount(y.views)}</td>
                  <td>{shortCount(Math.round(perMonth(y, "views")))}</td>
                  <td>{shortCount(y.likes)}</td>
                  <td>{shortCount(y.comments)}</td>
                  <td>{shortCount(y.shares)}</td>
                  <td>{erOf(y)}</td>
                </>
              )}
            </tr>
          ))}
          {prev && (
            <tr className="followers-change">
              <td>
                เปลี่ยนแปลง<small>{hasPosts ? "เทียบเฉลี่ยต่อเดือน" : "ผู้ติดตาม"}</small>
              </td>
              {cur.followersEnd !== null && prev.followersEnd !== null ? pctCell(change(cur.followersEnd, prev.followersEnd)) : <td>–</td>}
              {hasPosts && (
                <>
                  {pctCell(prev.months ? change(perMonth(cur, "posts"), perMonth(prev, "posts")) : null)}
                  {pctCell(prev.months ? change(perMonth(cur, "views"), perMonth(prev, "views")) : null)}
                  {pctCell(prev.months ? change(perMonth(cur, "views"), perMonth(prev, "views")) : null)}
                  {pctCell(prev.months ? change(perMonth(cur, "likes"), perMonth(prev, "likes")) : null)}
                  {pctCell(prev.months ? change(perMonth(cur, "comments"), perMonth(prev, "comments")) : null)}
                  {pctCell(prev.months ? change(perMonth(cur, "shares"), perMonth(prev, "shares")) : null)}
                  {cur.er !== null && prev.er !== null ? (
                    <td className={cur.er >= prev.er ? "up" : "down"}>{`${cur.er >= prev.er ? "+" : ""}${((cur.er - prev.er) * 100).toFixed(2)} จุด`}</td>
                  ) : (
                    <td>–</td>
                  )}
                </>
              )}
            </tr>
          )}
        </tbody>
      </table>
      <p className="audience-note">
        ⚠️ = ปีที่มีข้อมูลโพสต์ไม่ครบ 12 เดือน (ระบบเริ่มเก็บโพสต์ ก.ค.–ก.ย. 2568) แถวเปลี่ยนแปลงจึงเทียบแบบเฉลี่ยต่อเดือน · ผู้ติดตามสิ้นปี = ค่าวันสุดท้ายของปี (ปีปัจจุบันใช้ค่าล่าสุด)
      </p>
    </div>
  );
}

/** The board as CSV (Excel opens it with Thai intact), grouped as on screen. */
function downloadCsv(groups: Group[], view: View, stats: Record<string, AccountStat>, growth: (a: SocialAccount) => number | null, posts12: Map<string, PostTotals | null>) {
  const head = ["กลุ่ม", "รายการ", "แพลตฟอร์ม", "บัญชี", "ผู้ติดตาม", "ข้อมูลวันที่", "เพิ่มขึ้น 30 วัน", "ที่มา", "ตัวเลข API", "ตัวเลข Metricool", "หมายเหตุ", "โพสต์ 12 เดือน", "วิว 12 เดือน", "ไลก์ 12 เดือน", "คอมเมนต์ 12 เดือน", "แชร์ 12 เดือน", "ER 12 เดือน", "ลิงก์"];
  const lines = groups.flatMap((g) =>
    g.accounts.map((a) => {
      const now = currentFollowers(a, stats[a.id]);
      const gr = growth(a);
      const st = stats[a.id];
      const source = SOURCE_BADGE[sourceOf(a, st)].label;
      const p = posts12.get(a.id);
      const num = (v?: number) => (v === undefined ? "" : String(v));
      return [
        g.label, groupOf(a), PLATFORM_LABEL[a.platform], a.name, now ? String(now.value) : "", now?.date || "", gr === null ? "" : String(gr), source,
        num(st?.sources?.api?.value), num(st?.sources?.metricool?.value), st?.check || "",
        num(p?.posts), num(p?.views), num(p?.likes), num(p?.comments), num(p?.shares), p?.er == null ? "" : (p.er * 100).toFixed(2) + "%",
        accountUrl(a),
      ];
    }),
  );
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = "﻿" + [head, ...lines].map((r) => r.map(cell).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `followers-${view === "platform" ? "by-platform" : "by-show"}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}
