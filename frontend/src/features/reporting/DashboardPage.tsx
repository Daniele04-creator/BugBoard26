import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { IconRefresh } from "@tabler/icons-react";
import { ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/LoadingState";
import { dateTime, roleNames } from "../users/adminPresentation";
import { priorityNames, typeNames } from "../issues/issuePresentation";
import { reportingApi } from "./reportingApi";
import { Metrics, number, resolutionTime } from "./reportPresentation";
import "./reporting.css";
export function DashboardPage() {
  const snapshot = useQuery({
      queryKey: ["reporting", "dashboard"],
      queryFn: ({ signal }) => reportingApi.dashboard(signal),
    }),
    data = snapshot.data;
  return (
    <section className="reporting-page">
      <div className="reporting-heading">
        <div>
          <h1 tabIndex={-1}>Dashboard</h1>
          <p className="muted">Situazione corrente del progetto</p>
        </div>
        <Button
          busy={snapshot.isFetching}
          onClick={() => void snapshot.refetch()}
        >
          <IconRefresh size={20} stroke={2} aria-hidden="true" />
          Aggiorna dashboard
        </Button>
      </div>
      <ErrorAlert error={snapshot.error} />
      {snapshot.isPending ? (
        <LoadingState />
      ) : (
        data && (
          <div aria-busy={snapshot.isFetching} className="reporting-content">
            <p className="reporting-context">
              {snapshot.isFetching ? "Aggiornamento in corso. " : ""}Rilevata il{" "}
              <time dateTime={data.asOf}>{dateTime(data.asOf)}</time> ·{" "}
              {data.timezone}
            </p>
            <Metrics
              items={[
                {
                  label: "Aperte",
                  value: (
                    <Link to="/issues?status=TODO&status=IN_PROGRESS">
                      {number(data.openCount)}
                    </Link>
                  ),
                },
                {
                  label: "In corso",
                  value: (
                    <Link to="/issues?status=IN_PROGRESS">
                      {number(data.inProgressCount)}
                    </Link>
                  ),
                },
                {
                  label: "Aperte senza responsabile",
                  value: (
                    <Link to="/issues?assignedTo=unassigned&status=TODO&status=IN_PROGRESS">
                      {number(data.unassignedOpenCount)}
                    </Link>
                  ),
                },
                {
                  label: "Scadute",
                  value: (
                    <Link to="/issues?overdue=true&status=TODO&status=IN_PROGRESS">
                      {number(data.overdueOpenCount)}
                    </Link>
                  ),
                },
              ]}
            />
            <div className="reporting-workload">
              <div className="reporting-register">
                <table
                  className="reporting-table reporting-table--responsive reporting-table--load"
                  role="table"
                >
                  <caption>Carico corrente</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nome</th>
                      <th scope="col">Ruolo</th>
                      <th scope="col">Issue aperte</th>
                      <th scope="col">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.openByAssignee.map((row) => (
                      <tr key={row.user?.id ?? "unassigned"}>
                        <th scope="row">
                          {row.user?.displayName ?? "Senza responsabile"}
                        </th>
                        <td data-label="Ruolo">
                          {row.user ? roleNames[row.user.role] : "—"}
                        </td>
                        <td data-label="Issue aperte">{number(row.openCount)}</td>
                        <td className="reporting-row-action">
                          <Link
                            to={`/issues?assignedTo=${row.user?.id ?? "unassigned"}&status=TODO&status=IN_PROGRESS`}
                            aria-label={`Apri elenco di ${row.user?.displayName ?? "issue senza responsabile"}`}
                          >
                            Apri elenco
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="reporting-breakdowns">
                <div className="reporting-register">
                  <table className="reporting-table reporting-table--breakdown">
                    <caption>Aperte per tipo</caption>
                    <thead>
                      <tr>
                        <th scope="col">Tipo</th>
                        <th scope="col">Issue aperte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(typeNames).map(([type, label]) => (
                        <tr key={type}>
                          <th scope="row">{label}</th>
                          <td>
                            {number(
                              data.openByType[
                                type as keyof typeof data.openByType
                              ],
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="reporting-register">
                  <table className="reporting-table reporting-table--breakdown">
                    <caption>Aperte per priorità</caption>
                    <thead>
                      <tr>
                        <th scope="col">Priorità</th>
                        <th scope="col">Issue aperte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(priorityNames).map(([priority, label]) => (
                        <tr key={priority}>
                          <th scope="row">{label}</th>
                          <td>
                            {number(
                              data.openByPriority[
                                priority as keyof typeof data.openByPriority
                              ],
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <Metrics
              columns={5}
              items={[
                { label: "Issue non archiviate", value: number(data.activeIssueCount) },
                { label: "Risolte", value: number(data.resolvedCount) },
                { label: "Duplicate", value: number(data.duplicateCount) },
                {
                  label: "Tempo medio del ciclo",
                  value: resolutionTime(data.averageResolutionSeconds),
                },
                { label: "Cicli conclusi", value: number(data.resolutionCount) },
              ]}
            />
            <div className="reporting-register">
              <table
                className="reporting-table reporting-table--responsive"
                role="table"
              >
                <caption>Risoluzioni per assegnatario storico</caption>
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Cicli conclusi</th>
                    <th scope="col">Tempo medio</th>
                  </tr>
                </thead>
                <tbody>
                  {data.resolutionByAssignee.map((row) => (
                    <tr key={row.user.id}>
                      <th scope="row">
                        {row.user.displayName}
                        {!row.user.active && " · Inattivo"}
                      </th>
                      <td data-label="Cicli conclusi">
                        {number(row.resolutionCount)}
                      </td>
                      <td data-label="Tempo medio">
                        {resolutionTime(row.averageResolutionSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.resolutionByAssignee.length === 0 && (
                <p className="reporting-empty">Nessuna risoluzione.</p>
              )}
            </div>
            <details className="reporting-definition">
              <summary>Come si calcolano le metriche</summary>
              <p>
                Aperte: stati Da fare e In corso, escluse le issue archiviate.
                Il carico segue il responsabile attuale.
              </p>
              <p>
                Il tempo medio è il tempo trascorso dalla creazione o riapertura
                alla risoluzione, compresi attesa e giorni non lavorativi. Ogni
                ciclo risolto conta una volta; l'attribuzione segue il
                responsabile al momento della risoluzione.
              </p>
              <p>
                La media usa tutti i cicli conclusi delle issue attualmente non
                archiviate, anche se riaperte o duplicate. È calcolata dal
                server sui secondi, prima dell'arrotondamento in ore. Il report
                mensile include anche le issue oggi archiviate.
              </p>
            </details>
          </div>
        )
      )}
    </section>
  );
}
