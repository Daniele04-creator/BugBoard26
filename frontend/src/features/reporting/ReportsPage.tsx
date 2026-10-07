import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { SelectField } from "../../components/SelectField";
import { LoadingState } from "../../components/LoadingState";
import { Avatar } from "../../components/Avatar";
import { dateTime, roleNames } from "../users/adminPresentation";
import { reportingApi } from "./reportingApi";
import {
  currentRomeMonth,
  Metrics,
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
      <Button variant="primary" type="submit">
        Mostra report
      </Button>
    </form>
  );
}
export function ReportsPage() {
  const [params, setParams] = useSearchParams(),
    current = currentRomeMonth(),
    month = params.get("month") ?? current;
  const valid =
    validMonth(month, current) &&
    [...params.keys()].every((key) => key === "month") &&
    params.getAll("month").length <= 1;
  const report = useQuery({
      queryKey: ["reporting", "monthly", month],
      queryFn: ({ signal }) => reportingApi.monthly(month, signal),
      enabled: valid,
      placeholderData: keepPreviousData,
    }),
    data = report.data;
  return (
    <section className="reporting-page">
      <div className="reporting-heading">
        <div>
          <h1 tabIndex={-1}>Report mensili</h1>
          <p className="muted">
            Attività e risoluzioni ricostruite dalla cronologia, comprese le issue
            oggi archiviate.
          </p>
        </div>
      </div>
      {!valid ? (
        <Alert>
          Mese non valido. Scegli un mese da gennaio 2000 al corrente.{" "}
          <Button onClick={() => setParams(new URLSearchParams())}>
            Ripristina vista
          </Button>
        </Alert>
      ) : (
        <>
          <MonthFilter
            key={month}
            month={month}
            current={current}
            apply={(value) => setParams(new URLSearchParams({ month: value }))}
          />
          <ErrorAlert error={report.error} />
          {report.isPending ? (
            <LoadingState />
          ) : (
            data && (
              <div aria-busy={report.isFetching} className="reporting-content">
                <div className="reporting-period">
                  <div>
                    <h2>{monthName(data.month)}</h2>
                    <p className="reporting-context">
                      {report.isFetching ? "Aggiornamento in corso. " : ""}
                      {report.isPlaceholderData &&
                        "Sono ancora visibili i dati del mese precedente. "}
                      Periodo da {dateTime(data.periodStart)} incluso a{" "}
                      {dateTime(data.periodEnd)} escluso · {data.timezone}.
                    </p>
                    <p className="reporting-context">
                      Rilevato il{" "}
                      <time dateTime={data.asOf}>{dateTime(data.asOf)}</time>.
                    </p>
                  </div>
                  {data.partial && (
                    <Alert variant="info">
                      Mese corrente: dati parziali fino al momento della
                      rilevazione.
                    </Alert>
                  )}
                </div>
                <section
                  className="reporting-metric-group"
                  aria-labelledby="report-activity-heading"
                >
                  <h2 id="report-activity-heading">Attività del periodo</h2>
                  <Metrics
                    items={[
                      {
                        label: "Create",
                        value: number(data.totals.createdCount),
                      },
                      {
                        label: "Gestite",
                        value: number(data.totals.handledIssueCount),
                      },
                      {
                        label: "Cicli risolti",
                        value: number(data.totals.resolvedCycleCount),
                      },
                      {
                        label: "Issue risolte",
                        value: number(data.totals.resolvedIssueCount),
                      },
                    ]}
                  />
                </section>
                <section
                  className="reporting-metric-group"
                  aria-labelledby="report-outcomes-heading"
                >
                  <h2 id="report-outcomes-heading">Esiti e rielaborazione</h2>
                  <Metrics
                    items={[
                      {
                        label: "Duplicate",
                        value: number(data.totals.duplicatedCount),
                      },
                      {
                        label: "Riaperte",
                        value: number(data.totals.reopenedCount),
                      },
                      {
                        label: "Duplicazioni annullate",
                        value: number(data.totals.duplicateUndoneCount),
                      },
                      {
                        label: "Tempo medio del ciclo",
                        value: resolutionTime(
                          data.totals.averageResolutionSeconds,
                        ),
                      },
                    ]}
                  />
                </section>
                <section
                  className="reporting-metric-group"
                  aria-labelledby="report-end-heading"
                >
                  <h2 id="report-end-heading">Situazione al limite temporale</h2>
                  <Metrics
                    columns={2}
                    items={[
                      {
                        label: data.partial
                          ? "Aperte alla rilevazione"
                          : "Aperte al termine",
                        value: number(data.totals.openAtPeriodEnd),
                      },
                      {
                        label: data.partial
                          ? "Senza responsabile alla rilevazione"
                          : "Senza responsabile al termine",
                        value: number(data.unassignedOpenAtPeriodEnd),
                      },
                    ]}
                  />
                </section>
                <p className="reporting-scroll-hint" id="report-table-scroll">
                  Scorri la tabella per consultare tutte le colonne.
                </p>
                <div
                  className="reporting-register reporting-table-scroll"
                  role="region"
                  aria-label="Attività mensile per utente"
                  aria-describedby="report-table-scroll"
                  tabIndex={0}
                >
                  <table className="reporting-table reporting-table--monthly">
                    <caption>Attività per utente</caption>
                    <colgroup>
                      <col className="reporting-col-user" />
                      <col span={4} className="reporting-col-count" />
                      <col className="reporting-col-time" />
                      <col className="reporting-col-open" />
                    </colgroup>
                    <thead>
                      <tr>
                        {[
                          "Nome / Ruolo",
                          "Create",
                          "Gestite",
                          "Cicli risolti",
                          "Issue risolte",
                          "Tempo medio",
                          data.partial
                            ? "Aperte assegnate alla rilevazione"
                            : "Aperte assegnate al termine",
                        ].map((title) => (
                          <th key={title} scope="col">
                            {title}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.perUser.map((row) => (
                        <tr key={row.user.id}>
                          <th scope="row">
                            <div className="reporting-user">
                              <Avatar
                                name={row.user.displayName}
                                id={row.user.id}
                                size={32}
                              />
                              <div>
                                {row.user.displayName}
                                <div className="muted">
                                  {roleNames[row.user.role]}
                                  {!row.user.active && " · Inattivo"}
                                </div>
                              </div>
                            </div>
                          </th>
                          <td>{number(row.createdCount)}</td>
                          <td>{number(row.handledIssueCount)}</td>
                          <td>{number(row.resolvedCycleCount)}</td>
                          <td>{number(row.resolvedIssueCount)}</td>
                          <td>
                            {resolutionTime(row.averageResolutionSeconds)}
                          </td>
                          <td>{number(row.openAssignedAtPeriodEnd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.perUser.length === 0 && (
                    <p className="reporting-empty">Nessun account era presente in questo periodo.</p>
                  )}
                </div>
                <details className="reporting-definition">
                  <summary>Definizioni e criteri di attribuzione</summary>
                  <p>
                    Il periodo parte dal primo giorno alle 00:00 in Europe/Rome
                    incluso e finisce all'inizio del mese successivo escluso. Il
                    server considera l'ora legale e la cronologia fino
                    all'istante di rilevazione escluso.
                  </p>
                  <p>
                    Gestite: issue distinte con almeno una modifica o un
                    commento, escluse le sole creazioni. Una stessa issue può
                    essere gestita da più persone: il totale globale non è la
                    somma delle righe.
                  </p>
                  <p>
                    Cicli risolti: ogni risoluzione nel periodo; Issue risolte:
                    issue distinte. Una riapertura avvia un nuovo ciclo, mentre
                    una duplicazione non è una risoluzione. La durata media è
                    tempo trascorso, comprende attese e weekend, ed è attribuita
                    al responsabile storico della risoluzione.
                  </p>
                  <p>
                    Aperte e responsabile sono ricostruiti allo stato del
                    periodo dalla cronologia, non dai valori correnti. Gli
                    account inattivi restano nella tabella. Le medie sono
                    calcolate dal server prima dell'arrotondamento.
                  </p>
                </details>
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
