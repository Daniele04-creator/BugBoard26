import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { IconCalendar } from "../../components/Icons";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { SelectField } from "../../components/SelectField";
import { LoadingState } from "../../components/LoadingState";
import { Avatar } from "../../components/Avatar";
import { dateTime } from "../users/adminPresentation";
import { reportingApi } from "./reportingApi";
import {
  currentRomeMonth,
  AnalysisHeading,
  ReportWidget,
  monthName,
  number,
  resolutionTime,
  validMonth,
} from "./reportPresentation";
import "./reporting.css";
function MonthFilter({
  month,
  current,
  apply,
}: {
  month: string;
  current: string;
  apply: (month: string) => void;
}) {
  const [draft, setDraft] = useState(month),
    [error, setError] = useState("");
  const monthInputSupported =
    typeof document !== "undefined" &&
    (() => {
      const input = document.createElement("input");
      input.type = "month";
      return input.type === "month";
    })();
  return (
    <form
      className="reporting-filter"
      onSubmit={(event) => {
        event.preventDefault();
        if (!validMonth(draft, current)) {
          setError("Scegli un mese da gennaio 2000 al mese corrente.");
          return;
        }
        setError("");
        apply(draft);
      }}
    >
      {error && <Alert focus>{error}</Alert>}
      {monthInputSupported ? (
        <TextField
          label="Mese del report"
          type="month"
          required
          min="2000-01"
          max={current}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          error={error}
        />
      ) : (
        <div className="reporting-month-fallback">
          <SelectField
            label="Mese"
            value={draft.slice(5)}
            onChange={(event) =>
              setDraft(`${draft.slice(0, 4)}-${event.target.value}`)
            }
          >
            {Array.from({ length: 12 }, (_, index) =>
              String(index + 1).padStart(2, "0"),
            ).map((value) => (
              <option key={value} value={value}>
                {monthName(`2000-${value}`).replace(" 2000", "")}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Anno"
            value={draft.slice(0, 4)}
            onChange={(event) =>
              setDraft(`${event.target.value}-${draft.slice(5)}`)
            }
          >
            {Array.from(
              { length: Number(current.slice(0, 4)) - 1999 },
              (_, index) => 2000 + index,
            ).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      <Button type="submit">
        Mostra report
      </Button>
    </form>
  );
}
function SummaryTable({ rows, caption }: { rows: [string, string][]; caption: string }) {
  return <table className="reporting-table"><caption className="sr-only">{caption}</caption>
    <thead><tr><th scope="col">Metrica</th><th scope="col">Valore</th></tr></thead>
    <tbody>{rows.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody>
  </table>;
}
export function ReportsPage() {
  const [params, setParams] = useSearchParams(), current = currentRomeMonth(), month = params.get("month") ?? current;
  const valid = validMonth(month, current) && [...params.keys()].every(key => key === "month") && params.getAll("month").length <= 1;
  const report = useQuery({
    queryKey: ["reporting", "monthly", month],
    queryFn: ({ signal }) => reportingApi.monthly(month, signal),
    enabled: valid,
    placeholderData: keepPreviousData,
    refetchInterval: month === current ? 60_000 : false,
  });
  const data = report.data;
  const primary: [string, string][] = data ? [
    ["Create", number(data.totals.createdCount)], ["Gestite", number(data.totals.handledIssueCount)],
    ["Risolte", number(data.totals.resolvedIssueCount)], ["Aperte a fine periodo", number(data.totals.openAtPeriodEnd)],
    ["Tempo medio", resolutionTime(data.totals.averageResolutionSeconds)],
  ] : [];
  const secondary: [string, string][] = data ? [
    ["Cicli risolti", number(data.totals.resolvedCycleCount)], ["Duplicate", number(data.totals.duplicatedCount)],
    ["Riaperte", number(data.totals.reopenedCount)], ["Duplicazioni annullate", number(data.totals.duplicateUndoneCount)],
    ["Senza responsabile a fine periodo", number(data.unassignedOpenAtPeriodEnd)],
  ] : [];
  return <section className="reporting-page monthly-report">
    <AnalysisHeading />
    {!valid ? <Alert>Mese non valido. Scegli un mese da gennaio 2000 al corrente. <Button onClick={() => setParams(new URLSearchParams())}>Ripristina vista</Button></Alert> : <>
      <div className="reporting-period-controls">
        <MonthFilter key={month} month={month} current={current} apply={value => setParams(new URLSearchParams({ month: value }))} />
        {data && <div className="report-period-note"><strong>{data.partial ? "Periodo in corso" : "Periodo completo"}</strong>
          <h2>{monthName(data.month)}</h2>
        </div>}
      </div>
      <ErrorAlert error={report.error} />
      {report.isPending ? <LoadingState /> : data && <div aria-busy={report.isFetching} className="reporting-content">
        <div className="report-status" role="status"><IconCalendar size={15} />
          <span>{data.partial ? "Il mese è ancora in corso." : "Il periodo selezionato è concluso."}</span>
          {report.isPlaceholderData && <span>Sono ancora visibili i dati del mese precedente.</span>}
          {report.isFetching && <span>Aggiornamento in corso.</span>}
          <time className="reporting-as-of" dateTime={data.asOf}>Rilevato il {dateTime(data.asOf)}</time>
        </div>
        <ReportWidget title="Riepilogo del periodo" className="report-overview">
          <SummaryTable rows={primary} caption="Metriche del periodo selezionato" />
        </ReportWidget>
        <ReportWidget title="Attività per persona" className="report-people-widget" meta="Storico · include issue archiviate">
          <div className="reporting-table-scroll" role="region" aria-label="Attività mensile per utente" aria-describedby="report-table-scroll" tabIndex={0}>
            <table className="reporting-table reporting-table--monthly"><caption className="sr-only">Attività mensile per persona</caption>
              <thead><tr>{["Persona", "Create", "Gestite", "Risolte", "Tempo medio"].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead>
              <tbody>{data.perUser.map(row => <tr key={row.user.id}>
                <th scope="row"><div className="reporting-user"><Avatar name={row.user.displayName} id={row.user.id} size={24} />
                  <span>{row.user.displayName}{!row.user.active && " · Inattivo"}</span>
                </div></th>
                <td>{number(row.createdCount)}</td><td>{number(row.handledIssueCount)}</td><td>{number(row.resolvedIssueCount)}</td><td>{resolutionTime(row.averageResolutionSeconds)}</td>
              </tr>)}</tbody>
            </table>
            {data.perUser.length === 0 && <p className="reporting-empty">Nessun account era presente in questo periodo.</p>}
          </div>
          <p className="reporting-scroll-hint" id="report-table-scroll">Scorri in orizzontale per vedere tutte le metriche.</p>
        </ReportWidget>
        <details className="analysis-details"><summary>Dettagli sulle attività e sui cicli</summary>
          <ReportWidget title="Altre metriche del periodo" className="report-overview"><SummaryTable rows={secondary} caption="Metriche aggiuntive del periodo" /></ReportWidget>
          <ReportWidget title="Dettagli per persona" className="report-people-widget">
            <div className="reporting-table-scroll" role="region" aria-label="Dettagli mensili per persona" aria-describedby="report-details-scroll" tabIndex={0}>
              <table className="reporting-table reporting-table--monthly"><caption className="sr-only">Cicli e issue aperte per persona</caption>
                <thead><tr><th scope="col">Persona</th><th scope="col">Cicli risolti</th><th scope="col">{data.partial ? "Aperte alla rilevazione" : "Aperte al termine"}</th></tr></thead>
                <tbody>{data.perUser.map(row => <tr key={row.user.id}><th scope="row">{row.user.displayName}</th><td>{number(row.resolvedCycleCount)}</td><td>{number(row.openAssignedAtPeriodEnd)}</td></tr>)}</tbody>
              </table>
              {!data.perUser.length && <p className="reporting-empty">Nessuna attività nel mese selezionato.</p>}
            </div>
            <p className="reporting-scroll-hint" id="report-details-scroll">Scorri in orizzontale per vedere tutte le metriche.</p>
          </ReportWidget>
        </details>
      </div>}
    </>}
  </section>;
}
