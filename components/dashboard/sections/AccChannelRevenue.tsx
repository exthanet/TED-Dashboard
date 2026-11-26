"use client";
// YouTube Revenue report → "รายได้แต่ละช่องใน CMS": each channel's revenue for one month, the same
// Monthly ACC data (YouTube Analytics API through the CMS) as รายได้ → Monthly ACC, revenue columns only.
import { useEffect, useMemo, useState } from "react";
import { Tv2 } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { loadAccMonths } from "@/lib/accMonthlyData";
import { accTotals, hasTotalRevenue, monthEnd, rowNote, type AccMonth, type AccNums } from "@/lib/dashboard/accMonthly";

/** Pie: the top channels by revenue, the rest as one slice. */
const TOP = 7;
const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#059669", "#0891b2", "#ca8a04", "#94a3b8"];

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });

export function AccChannelRevenue({ currency, rates, year }: { currency: "USD" | "THB"; rates?: Record<string, number>; year: string }) {
  const [months, setMonths] = useState<AccMonth[] | null>(null);
  const [picked, setPicked] = useState("");
  useEffect(() => {
    loadAccMonths()
      .then(setMonths)
      .catch(() => setMonths([]));
  }, []);

  // Months of the year picked at the top (all when "ALL"); the newest finished month first by default.
  const list = useMemo(() => (months || []).filter((m) => year === "ALL" || m.month.startsWith(year)), [months, year]);
  const month = list.find((m) => m.month === picked) || list.find((m) => m.through >= monthEnd(m.month)) || list[0] || null;
  if (!months || !month) return null;

  const rate = rates?.[month.month];
  const thb = currency === "THB" && !!rate;
  const factor = thb ? rate! : 1;
  const cur = thb ? "THB" : "USD";
  const money = (v: number) => new Intl.NumberFormat(thb ? "th-TH" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format((v || 0) * factor);
  const withTotal = hasTotalRevenue(month);
  const total = accTotals(month.rows);
  const cells = (r: AccNums) => (
    <>
      <td className="num">{r.views.toLocaleString("en-US")}</td>
      <td className="num">{money(r.adRevenue)}</td>
      <td className="num">{money(r.premiumRevenue)}</td>
      <td className="num strong">{withTotal ? money(r.totalRevenue) : "–"}</td>
    </>
  );

  // Each channel's share: Estimated partner revenue (every source), or Ads + Premium for months without it.
  const value = (r: AccNums) => (withTotal ? r.totalRevenue : r.adRevenue + r.premiumRevenue);
  const ranked = month.rows
    .filter((r) => !r.missing)
    .map((r) => ({ name: r.name, value: value(r as AccNums) * factor }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const rest = ranked.slice(TOP);
  const slices = [...ranked.slice(0, TOP), ...(rest.length ? [{ name: `อื่นๆ (${rest.length} ช่อง)`, value: rest.reduce((a, x) => a + x.value, 0) }] : [])];
  const sliceTotal = slices.reduce((a, x) => a + x.value, 0);
  const fmt = (v: number) => new Intl.NumberFormat(thb ? "th-TH" : "en-US", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v);
  const pct = (v: number) => (sliceTotal ? `${((v / sliceTotal) * 100).toFixed(1)}%` : "–");

  return (
    <article className="panel acc-channel-revenue">
      <div className="panel-head">
        <div>
          <h3>
            <Tv2 size={16} /> รายได้แต่ละช่องใน CMS ({cur})
          </h3>
          <p>
            ที่มา: YouTube Analytics API (Monthly ACC)
            {month.through < monthEnd(month.month) ? ` · เดือนนี้ยังไม่จบ ข้อมูลถึง ${month.through}` : ""}
            {currency === "THB" && !rate ? " · ยังไม่มีอัตราแลกเปลี่ยนของเดือนนี้ แสดงเป็น USD" : ""}
          </p>
        </div>
        <select className="yt-curve-pick" value={month.month} onChange={(e) => setPicked(e.target.value)} aria-label="เดือน">
          {list.map((m) => (
            <option key={m.month} value={m.month}>
              {monthLabel(m.month)}
            </option>
          ))}
        </select>
      </div>
      <div className="acc-channel-layout">
      <div className="acc-channel-pie">
        <strong>สัดส่วนรายได้แต่ละช่อง</strong>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip formatter={(v, name) => [`${fmt(Number(v))} · ${pct(Number(v))}`, String(name)]} />
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={1} isAnimationActive={false}>
                {slices.map((x, i) => (
                  <Cell key={x.name} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul>
          {slices.map((x, i) => (
            <li key={x.name}>
              <i style={{ background: COLORS[i % COLORS.length] }} />
              <span>{x.name}</span>
              <b>{pct(x.value)}</b>
            </li>
          ))}
        </ul>
        <small>{withTotal ? "จาก Est. partner revenue (รายได้รวมทุกแหล่ง)" : "เดือนนี้ยังไม่มี Est. partner revenue: ใช้ Ads + Premium"}</small>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ช่อง</th>
              <th className="num" title="Owned Views ของช่องในเดือนนี้ (YouTube Analytics)">Total views</th>
              <th className="num">Ads Partner Revenue</th>
              <th className="num">YouTube Premium</th>
              <th className="num" title="ตรงกับ Estimated partner revenue ใน YouTube Analytics">Est. partner revenue</th>
            </tr>
          </thead>
          <tbody>
            {month.rows.map((r) => (
              <tr key={r.name} className={r.missing ? "acc-missing" : r.program ? "acc-program" : ""}>
                <td>
                  {r.name}
                  {!r.missing && rowNote(r) && <small className="acc-id">{rowNote(r)}</small>}
                  {r.missing && <small className="acc-id">ไม่พบช่องนี้ใน CMS ที่เชื่อมต่อ</small>}
                </td>
                {r.missing ? (
                  <>
                    {Array.from({ length: 4 }, (_, i) => (
                      <td key={i} className="num muted">
                        –
                      </td>
                    ))}
                  </>
                ) : (
                  cells(r as AccNums)
                )}
              </tr>
            ))}
            <tr className="acc-total">
              <td>รวม</td>
              {cells(total)}
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </article>
  );
}
