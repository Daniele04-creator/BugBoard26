import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { IconCalendar, IconUser } from "../../components/Icons";
import { ErrorAlert } from "../../components/Alert";
import { LoadingState } from "../../components/LoadingState";
import { issueApi } from "../issues/issueApi";
import { priorityNames, typeNames } from "../issues/issuePresentation";
import { reportingApi } from "./reportingApi";
import { AnalysisHeading, Distribution, number, ReportWidget, resolutionTime } from "./reportPresentation";
import "./reporting.css";
const openQuery = "status=TODO&status=IN_PROGRESS";
export function DashboardPage() {
  const snapshot = useQuery({
    queryKey: ["reporting", "dashboard"],
    queryFn: ({ signal }) => reportingApi.dashboard(signal),
    refetchInterval: 60_000,
  });
  const attention = useQuery({
    queryKey: ["reporting", "attention"],
    queryFn: async ({ signal }) => {
      const [overdue, unassigned] = await Promise.all([
        issueApi.list(`${openQuery}&overdue=true&size=5`, signal),
        issueApi.list(`${openQuery}&assignedTo=unassigned&size=5`, signal),
      ]);
      const rows = overdue.items.map(issue => ({ issue, reason: "Scaduta" }));
      rows.push(...unassigned.items.filter(issue => !rows.some(row => row.issue.id === issue.id))
        .map(issue => ({ issue, reason: "Senza responsabile" })));
      return rows;
    },
    enabled: !!snapshot.data,
    refetchInterval: 60_000,
  });
  const data = snapshot.data;
  return <section className="reporting-page operations-view">
    <AnalysisHeading />
    <ErrorAlert error={snapshot.error} />
    {snapshot.isPending ? <LoadingState /> : data && <div className="reporting-content" aria-busy={snapshot.isFetching}>
      <div className="widget-grid">
        <ReportWidget title="Issue per stato" to="/issues" note={`${number(data.activeIssueCount)} issue non archiviate · conteggi sulle barre · seleziona uno stato per aprire le issue`}>
          <Distribution total={data.activeIssueCount} rows={[
            { label: "Da fare", value: data.openCount - data.inProgressCount, color: "muted", to: "/issues?status=TODO" },
            { label: "In corso", value: data.inProgressCount, color: "warning", to: "/issues?status=IN_PROGRESS" },
            { label: "Risolte", value: data.resolvedCount, color: "success", to: "/issues?status=RESOLVED" },
            { label: "Duplicate", value: data.duplicateCount, color: "done", to: "/issues?status=DUPLICATE" },
          ]} />
        </ReportWidget>
        <ReportWidget title="Issue aperte per responsabile" to={`/issues?${openQuery}`} note={`${number(data.openCount)} issue aperte · conteggi sulle barre`}>
          <Distribution total={data.openCount} rows={data.openByAssignee.map(row => ({
            label: row.user?.displayName ?? "Non assegnate", value: row.openCount,
            color: row.user ? "accent" : "muted",
            to: `/issues?assignedTo=${encodeURIComponent(row.user?.id ?? "unassigned")}&${openQuery}`,
          }))} />
          {!data.openByAssignee.length && <p className="reporting-empty">Nessuna issue aperta.</p>}
        </ReportWidget>
        <ReportWidget title="Tempi di risoluzione" to="/admin/reports" note="Issue non archiviate · solo cicli conclusi">
          <table className="widget-summary"><caption className="sr-only">Tempi di risoluzione complessivi</caption><tbody>
            <tr><th scope="row">Tempo medio complessivo</th><td>{resolutionTime(data.averageResolutionSeconds)}</td></tr>
            <tr><th scope="row">Risoluzioni concluse</th><td>{number(data.resolutionCount)}</td></tr>
          </tbody></table>
          <table className="widget-summary resolution-people"><caption>Tempo medio per persona</caption><thead><tr><th scope="col">Persona</th><th scope="col">Tempo medio</th></tr></thead><tbody>
            {data.resolutionByAssignee.map(row => <tr key={row.user.id}><th scope="row">{row.user.displayName}{!row.user.active && " · Inattivo"}</th><td>{resolutionTime(row.averageResolutionSeconds)}</td></tr>)}
            {!data.resolutionByAssignee.length && <tr><td colSpan={2}>Nessuna risoluzione.</td></tr>}
          </tbody></table>
        </ReportWidget>
        <ReportWidget title="Issue da gestire">
          <div className="attention-tabs">
            <Link to={`/issues?overdue=true&${openQuery}`}><IconCalendar size={14} />{number(data.overdueOpenCount)} scadute</Link>
            <Link to={`/issues?assignedTo=unassigned&${openQuery}`}><IconUser size={14} />{number(data.unassignedOpenCount)} senza responsabile</Link>
          </div>
          <ErrorAlert error={attention.error} />
          {attention.isPending ? <LoadingState /> : <div className="widget-issue-list">
            {attention.data?.map(({ issue, reason }) => <Link className="widget-issue" to={`/issues/${issue.id}`} key={issue.id}>
              <span>BB-{issue.number} · {reason}</span><strong>{issue.title}</strong><span>{issue.assignee?.displayName ?? "Non assegnata"}</span>
            </Link>)}
            {attention.data?.length === 0 && <p className="reporting-empty">Nessuna issue richiede attenzione.</p>}
          </div>}
        </ReportWidget>
      </div>
      <details className="analysis-details"><summary>Distribuzione per tipo e priorità</summary><div className="widget-grid">
        <ReportWidget title="Issue aperte per tipo" note={`${number(data.openCount)} issue aperte · conteggi sulle barre`}>
          <Distribution total={data.openCount} rows={(["BUG", "FEATURE", "QUESTION", "DOCUMENTATION"] as const).map((type, index) => ({
            label: typeNames[type], value: data.openByType[type], color: ["accent", "done", "warning", "success"][index], to: `/issues?type=${type}&${openQuery}`,
          }))} />
        </ReportWidget>
        <ReportWidget title="Issue aperte per priorità" note={`${number(data.openCount)} issue aperte · conteggi sulle barre`}>
          <Distribution total={data.openCount} rows={(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((priority, index) => ({
            label: priorityNames[priority], value: data.openByPriority[priority], color: ["danger", "warning", "accent", "muted"][index], to: `/issues?priority=${priority}&${openQuery}`,
          }))} />
        </ReportWidget>
      </div></details>
    </div>}
  </section>;
}
