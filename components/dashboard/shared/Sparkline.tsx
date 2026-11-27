// A small line chart for a KPI card: the shape of the number over the selected dates, no axes.
// The line, a soft area under it and a dot on the last point; hover a point for its value.
import { useState } from "react";

export interface SparkPoint {
  /** Period label (a day "YYYY-MM-DD" or a month "YYYY-MM"). */
  date: string;
  value: number;
}

const W = 200;
const H = 40;
const PAD = 3;

export function Sparkline({ points, color, format, label }: { points: SparkPoint[]; color: string; format: (v: number) => string; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(0, ...points.map((p) => p.value));
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
  const shown = hover ?? points.length - 1;
  const p = points[shown];
  const when = p.date.length === 7 ? new Date(`${p.date}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "short", year: "2-digit", timeZone: "UTC" }) : new Date(`${p.date}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div className="kpi-spark">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: ${points.length} ช่วง ล่าสุด ${format(points.at(-1)!.value)}`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <path d={area} fill={color} opacity="0.12" />
        <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(shown)} cy={y(p.value)} r="2.6" fill={color} />
      </svg>
      <span className="kpi-spark-tip">
        {when} · {format(p.value)}
      </span>
    </div>
  );
}
