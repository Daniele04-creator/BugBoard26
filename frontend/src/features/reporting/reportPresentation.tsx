import { useId, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Link } from "react-router-dom";

const numberFormat = new Intl.NumberFormat("it-IT");
const daysFormat = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });
export function number(value: number) { return numberFormat.format(value); }
export function resolutionTime(seconds: number | null) {
  return seconds === null ? "—" : `${daysFormat.format(seconds / 86400)} giorni`;
}
export function currentRomeMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Rome", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  return `${parts.find(part => part.type === "year")?.value}-${parts.find(part => part.type === "month")?.value}`;
}
export function validMonth(month: string, current = currentRomeMonth()) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month >= "2000-01" && month <= current;
}
export function monthName(month: string) {
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T12:00:00Z`));
}
export function AnalysisHeading() {
  return <><div className="reporting-heading"><h1 tabIndex={-1}>Analisi</h1></div>
    <nav className="reporting-tabs" aria-label="Analisi">
      <NavLink to="/admin/dashboard">Panoramica</NavLink>
      <NavLink to="/admin/reports">Report mensile</NavLink>
    </nav></>;
}
export function ReportWidget({ title, to, note, meta, children, className = "" }: {
  title: string; to?: string; note?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string;
}) {
  const id = useId();
  return <section className={`report-widget ${className}`} aria-labelledby={id}>
    <header className="widget-header"><h2 id={id}>{to ? <Link to={to}>{title}</Link> : title}</h2>{meta && <span className="reporting-history-note">{meta}</span>}</header>
    {note && <p className="widget-caption">{note}</p>}
    <div className="widget-body">{children}</div>
  </section>;
}
export interface DistributionRow { label: string; value: number; color?: string; to?: string }
function Bar({ row, total }: { row: DistributionRow; total: number }) {
  const id = useId(), [open, setOpen] = useState(false), [dismissed, setDismissed] = useState(false);
  const percent = total ? Math.round(row.value / total * 100) : 0;
  return <div className="distribution-row" role="listitem">
    {row.to ? <Link className="distribution-name" to={row.to}>{row.label}</Link> : <span className="distribution-name">{row.label}</span>}
    <span className="distribution-bar" data-tooltip-open={open || undefined} data-tooltip-dismissed={dismissed || undefined}
      onPointerEnter={() => setDismissed(false)} onPointerLeave={() => { setOpen(false); setDismissed(false); }}>
      <button type="button" className="distribution-track" aria-label={`${row.label}: ${number(row.value)} issue, ${percent}%`} aria-describedby={id}
        onFocus={() => setDismissed(false)} onBlur={() => { setOpen(false); setDismissed(false); }}
        onClick={() => { setDismissed(false); setOpen(!open); }}
        onKeyDown={event => { if (event.key === "Escape") { setOpen(false); setDismissed(true); } }}>
        <i className={`chart-${row.color ?? "accent"}`} style={{ width: `${percent}%` }} />
      </button>
      <span className="chart-tooltip" role="tooltip" id={id}>{number(row.value)} issue · {percent}%</span>
    </span>
    <span className="distribution-share">{percent}%</span>
  </div>;
}
export function Distribution({ rows, total }: { rows: DistributionRow[]; total: number }) {
  return <div className="distribution-chart" role="list">{rows.map(row => <Bar key={row.to ?? row.label} row={row} total={total} />)}</div>;
}
