"use client";
// YouTube Revenue report → "รายได้แต่ละช่องใน CMS": each channel's revenue for one month, the same
// Monthly ACC data (YouTube Analytics API through the CMS) as รายได้ → Monthly ACC, revenue columns only.
import { useEffect, useMemo, useState } from "react";
import { Tv2 } from "lucide-react";
import { loadAccMonths } from "@/lib/accMonthlyData";
import { accTotals, hasTotalRevenue, monthEnd, otherRevenue, rowNote, type AccMonth, type AccNums } from "@/lib/dashboard/accMonthly";

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
      <td className="num">{money(r.adRevenue)}</td>
      <td className="num">{money(r.premiumRevenue)}</td>
      <td className="num">{money(r.adRevenue + r.premiumRevenue)}</td>
      <td className="num strong">{withTotal ? money(r.totalRevenue) : "–"}</td>
      <td className="num">{withTotal ? money(otherRevenue(r)) : "–"}</td>
    </>
  );

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
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ช่อง</th>
              <th className="num">Ads Partner Revenue</th>
              <th className="num">YouTube Premium</th>
              <th className="num">Ads + Premium</th>
              <th className="num" title="ตรงกับ Estimated partner revenue ใน YouTube Analytics">Est. partner revenue</th>
              <th className="num" title="รวม − Ads − Premium: Shopping, Membership, Super Thanks และอื่นๆ">รายได้อื่น</th>
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
                    {Array.from({ length: 5 }, (_, i) => (
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
    </article>
  );
}
