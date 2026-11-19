export function Kpi({
  tone,
  icon,
  label,
  value,
  detail,
  growth,
  all,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  /** % change badge(s) shown beside the value. */
  growth?: React.ReactNode;
  /** The same number for every program, while the รายการ filter picks some. */
  all?: React.ReactNode;
}) {
  return (
    <article className={`kpi-card ${tone}`}>
      <div className="kpi-icon">{icon}</div>
      <div>
        <p>{label}</p>
        {all !== undefined && all !== null && <span className="kpi-all">ทุกรายการ <b>{all}</b></span>}
        <strong>{value}</strong>
        {growth && <div className="kpi-growth-row">{growth}</div>}
        <small>{detail}</small>
      </div>
    </article>
  );
}
