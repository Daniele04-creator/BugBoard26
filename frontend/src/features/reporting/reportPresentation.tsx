import type { ReactNode } from "react";
const numberFormat = new Intl.NumberFormat("it-IT");
const hoursFormat = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
export function number(value: number) {
  return numberFormat.format(value);
}
export function resolutionTime(seconds: number | null) {
  return seconds === null
    ? "Nessuna risoluzione"
    : `${hoursFormat.format(seconds / 3600)} ore`;
}
export function currentRomeMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}
export function validMonth(month: string, current = currentRomeMonth()) {
  return (
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    month >= "2000-01" &&
    month <= current
  );
}
export function monthName(month: string) {
  return new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T12:00:00Z`));
}
export function Metrics({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="admin-metrics">
      {items.map((item) => (
        <div key={item.label} className="panel admin-metric">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
