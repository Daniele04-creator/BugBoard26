import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { IssueSummary } from "../../api/types";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Pagination } from "../../components/Pagination";
import { LoadingState } from "../../components/LoadingState";
import { useAuth } from "../auth/AuthProvider";
import { getDirectory, getLabels, issueApi } from "./issueApi";
import {
  dateOnly,
  dateTime,
  normalized,
  parseIssueQuery,
  priorityNames,
  statusNames,
  todayRome,
  typeNames,
  userName,
} from "./issuePresentation";
import { IssueBadges } from "./IssueBadges";
import "./styles.css";
const sortNames = {
  createdAt: "Creazione",
  updatedAt: "Aggiornamento",
  lastActivityAt: "Ultima attività",
  priority: "Priorità",
  dueDate: "Scadenza",
  title: "Titolo",
  number: "Numero",
};
export function IssueListPage({ archived = false }: { archived?: boolean }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { user, getDraft, setDraft: setMemoryDraft } = useAuth();
  const [draft, setDraft] = useState(params.toString());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const [exportSuccess, setExportSuccess] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(
    () => window.innerWidth >= 640,
  );
  const query = params.toString();
  const restoredPosition = useRef<string | null>(null);
  const completedQuery = useRef(query);
  useEffect(() => setDraft(query), [query]);
  const parsed = useMemo(() => {
    try {
      return {
        value: parseIssueQuery(new URLSearchParams(query)),
        error: null,
      };
    } catch (error) {
      return { value: null, error };
    }
  }, [query]);
  const apiParams = new URLSearchParams(query);
  apiParams.set("archived", String(archived));
  const list = useQuery({
    queryKey: ["issues", "list", archived, query],
    queryFn: ({ signal }) => issueApi.list(apiParams.toString(), signal),
    enabled: !!parsed.value,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    if (list.data && !list.isPlaceholderData) completedQuery.current = query;
  }, [list.data, list.isPlaceholderData, query]);
  useEffect(() => {
    const key = location.pathname + location.search;
    if (list.data && restoredPosition.current !== key) {
      const state = location.state as { restoreScrollY?: number } | null;
      const position =
        state?.restoreScrollY ?? getDraft<number>(`list-scroll:${key}`);
      if (position !== undefined) {
        let finalFrame = 0;
        const frame = requestAnimationFrame(() => {
          finalFrame = requestAnimationFrame(() => {
            restoredPosition.current = key;
            const id = getDraft<string>(`list-focus:${key}`);
            const link = id
              ? Array.from(
                  document.querySelectorAll<HTMLAnchorElement>(
                    `a[data-issue-id="${id}"]`,
                  ),
                ).find((node) => node.getClientRects().length > 0)
              : null;
            link?.focus({ preventScroll: true });
            window.scrollTo({ top: position, behavior: "instant" });
          });
        });
        return () => {
          cancelAnimationFrame(frame);
          cancelAnimationFrame(finalFrame);
        };
      }
      restoredPosition.current = key;
    }
  }, [list.data, location.pathname, location.search, location.state, getDraft]);
  const labels = useQuery({
    queryKey: ["labels", "active"],
    queryFn: ({ signal }) => getLabels(signal),
  });
  const directory = useQuery({
    queryKey: ["users", "directory"],
    queryFn: ({ signal }) => getDirectory(signal),
  });
  const draftParams = new URLSearchParams(draft);
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(draft);
    if (value) next.set(key, value);
    else next.delete(key);
    setDraft(next.toString());
  }
  function toggle(key: string, value: string, checked: boolean) {
    const next = new URLSearchParams(draft);
    const values = new Set(next.getAll(key));
    if (checked) values.add(value);
    else values.delete(value);
    next.delete(key);
    values.forEach((v) => next.append(key, v));
    setDraft(next.toString());
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    const next = new URLSearchParams(draft);
    const q = normalized(next.get("q") ?? "");
    if (q) next.set("q", q);
    else next.delete("q");
    next.delete("page");
    setParams(next);
  }
  function changeParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (
      (key === "page" && value === "0") ||
      (key === "size" && value === "20") ||
      (key === "sort" && value === "createdAt,desc")
    )
      next.delete(key);
    else next.set(key, value);
    if (key !== "page") next.delete("page");
    setParams(next);
  }
  async function exportCsv() {
    const snapshot = new URLSearchParams(apiParams);
    snapshot.delete("page");
    snapshot.delete("size");
    setExportError(null);
    setExportSuccess("");
    setExporting(true);
    try {
      const blob = await issueApi.export(snapshot.toString());
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bugboard26-${archived ? "archivio" : "issue"}-${todayRome()}.csv`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportSuccess(
        `CSV esportato: ${snapshot.get("q") || "tutte le issue"} (${archived ? "archivio" : "elenco corrente"}).`,
      );
    } catch (error) {
      setExportError(error);
    } finally {
      setExporting(false);
    }
  }
  function issueLink(issue: IssueSummary) {
    return (
      <Link
        to={`/issues/${issue.id}`}
        data-issue-id={issue.id}
        onClick={() => {
          setMemoryDraft(
            `list-focus:${location.pathname + location.search}`,
            issue.id,
          );
          setMemoryDraft(
            `list-scroll:${location.pathname + location.search}`,
            window.scrollY,
          );
        }}
        state={{
          returnTo: location.pathname + location.search,
          scrollY: window.scrollY,
        }}
      >
        BB-{issue.number} · {issue.title}
      </Link>
    );
  }
  const scopeParams = new URLSearchParams(params);
  scopeParams.delete("page");
  return (
    <section>
      <div className="issue-heading">
        <div>
          <h1 tabIndex={-1}>{archived ? "Archivio" : "Issue"}</h1>
          {archived && (
            <p>Le issue archiviate restano consultabili in sola lettura.</p>
          )}
        </div>
        {!archived && user?.role !== "VIEWER" && (
          <Link className="button button-primary" to="/issues/new">
            Nuova issue
          </Link>
        )}
      </div>
      <Link
        to={`${archived ? "/issues" : "/archive"}${scopeParams.size ? "?" + scopeParams : ""}`}
      >
        {archived ? "Passa alle issue correnti" : "Passa all’archivio"}
      </Link>
      {parsed.error ? (
        <>
          <ErrorAlert error={parsed.error} />
          <Button onClick={() => setParams({})}>Ripristina vista</Button>
        </>
      ) : (
        <>
          <form className="panel" onSubmit={apply}>
            <div className="filter-search">
              <label htmlFor="issue-search">
                Cerca nel titolo o nella descrizione
                <input
                  id="issue-search"
                  value={draftParams.get("q") ?? ""}
                  onChange={(e) => setFilter("q", e.target.value)}
                />
              </label>
              <Button type="submit">Cerca</Button>
            </div>
            <Button
              aria-expanded={filtersOpen}
              aria-controls="issue-filter-fields"
              onClick={() => setFiltersOpen((value) => !value)}
            >
              Filtri ·{" "}
              {
                Array.from(params.keys()).filter(
                  (key) => !["q", "page", "size", "sort"].includes(key),
                ).length
              }{" "}
              attivi
            </Button>
            <div id="issue-filter-fields" hidden={!filtersOpen}>
              <div className="filter-grid">
                {Object.entries({
                  type: typeNames,
                  status: statusNames,
                  priority: priorityNames,
                }).map(([key, values]) => (
                  <fieldset key={key}>
                    <legend>
                      {
                        { type: "Tipo", status: "Stato", priority: "Priorità" }[
                          key
                        ]
                      }
                    </legend>
                    {Object.entries(values).map(([value, text]) => (
                      <label className="check-option" key={value}>
                        <input
                          type="checkbox"
                          checked={draftParams.getAll(key).includes(value)}
                          onChange={(e) => toggle(key, value, e.target.checked)}
                        />
                        {text}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <fieldset>
                  <legend>Etichette</legend>
                  <ErrorAlert error={labels.error} />
                  {labels.data?.map((label) => (
                    <label className="check-option" key={label.id}>
                      <input
                        type="checkbox"
                        checked={draftParams
                          .getAll("labelId")
                          .includes(label.id)}
                        onChange={(e) =>
                          toggle("labelId", label.id, e.target.checked)
                        }
                      />
                      {label.name}
                    </label>
                  ))}
                </fieldset>
                <label>
                  Assegnatario
                  <select
                    value={draftParams.get("assignedTo") ?? ""}
                    onChange={(e) => setFilter("assignedTo", e.target.value)}
                  >
                    <option value="">Tutti</option>
                    {user?.role !== "VIEWER" && (
                      <option value="me">Assegnate a me</option>
                    )}
                    <option value="unassigned">Senza assegnazione</option>
                    {directory.data?.map((person) => (
                      <option key={person.id} value={person.id}>
                        {userName(person)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Reporter
                  <select
                    value={draftParams.get("reporterId") ?? ""}
                    onChange={(e) => setFilter("reporterId", e.target.value)}
                  >
                    <option value="">Tutti</option>
                    {directory.data?.map((person) => (
                      <option key={person.id} value={person.id}>
                        {userName(person)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Scadenza
                  <select
                    value={draftParams.get("overdue") ?? ""}
                    onChange={(e) => setFilter("overdue", e.target.value)}
                  >
                    <option value="">Qualsiasi</option>
                    <option value="true">Scadute</option>
                    <option value="false">Non scadute</option>
                  </select>
                </label>
              </div>
              <ErrorAlert error={directory.error} />
              <div className="actions">
                <Button type="submit">Applica filtri</Button>
                <Button
                  onClick={() => {
                    setDraft("");
                    setParams({});
                  }}
                >
                  Pulisci filtri
                </Button>
              </div>
            </div>
          </form>
          <div className="issue-list-toolbar">
            {list.data && (
              <span role="status">{list.data.totalElements} risultati</span>
            )}
            <label>
              Ordina
              <select
                value={parsed.value?.sort.split(",")[0]}
                onChange={(e) =>
                  changeParam(
                    "sort",
                    `${e.target.value},${parsed.value?.sort.split(",")[1]}`,
                  )
                }
              >
                {Object.entries(sortNames).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Direzione
              <select
                value={parsed.value?.sort.split(",")[1]}
                onChange={(e) =>
                  changeParam(
                    "sort",
                    `${parsed.value?.sort.split(",")[0]},${e.target.value}`,
                  )
                }
              >
                <option value="desc">Decrescente</option>
                <option value="asc">Crescente</option>
              </select>
            </label>
            <Button busy={exporting} onClick={() => void exportCsv()}>
              Esporta CSV
            </Button>
          </div>
          <ErrorAlert error={exportError} />
          {exportSuccess && <Alert variant="success">{exportSuccess}</Alert>}
          {list.isFetching && list.data && (
            <Alert variant="info">
              Aggiornamento in corso. I risultati mostrati corrispondono alla
              vista precedente:{" "}
              {new URLSearchParams(completedQuery.current).get("q") ||
                "tutte le issue"}
              ; filtri confermati:{" "}
              {Array.from(new URLSearchParams(completedQuery.current).entries())
                .filter(([key]) => !["q", "page", "size", "sort"].includes(key))
                .map(
                  ([key, value]) =>
                    `${({ type: "Tipo", status: "Stato", priority: "Priorità", labelId: "Etichetta", assignedTo: "Responsabile", reporterId: "Reporter", overdue: "Scadute" } as Record<string, string>)[key] ?? key}: ${({ ...typeNames, ...statusNames, ...priorityNames } as Record<string, string>)[value] ?? labels.data?.find((label) => label.id === value)?.name ?? directory.data?.find((person) => person.id === value)?.displayName ?? ({ me: "Assegnate a me", unassigned: "Senza assegnazione", true: "Sì", false: "No" } as Record<string, string>)[value] ?? value}`,
                )
                .join("; ") || "nessuno"}
              .
            </Alert>
          )}
          {list.isPending ? (
            <LoadingState />
          ) : list.error ? (
            <>
              <ErrorAlert error={list.error} />
              <Button onClick={() => void list.refetch()}>
                Riprova caricamento
              </Button>
            </>
          ) : (
            list.data && (
              <>
                {list.data.items.length === 0 ? (
                  <div className="empty-state">
                    <h2>
                      {list.data.totalElements > 0
                        ? "Pagina fuori intervallo. Le issue corrispondenti sono nelle altre pagine."
                        : Array.from(params.keys()).some(
                              (key) => !["page", "size", "sort"].includes(key),
                            )
                          ? "Nessuna issue corrisponde ai filtri."
                          : archived
                            ? "Non ci sono issue archiviate."
                            : "Non ci sono ancora issue."}
                    </h2>
                    <Button
                      onClick={() => {
                        if (list.data!.totalElements > 0) {
                          const firstPage = new URLSearchParams(params);
                          firstPage.set("page", "0");
                          setParams(firstPage);
                        } else {
                          setDraft("");
                          setParams({});
                        }
                      }}
                    >
                      {list.data.totalElements > 0
                        ? "Prima pagina"
                        : "Pulisci filtri"}
                    </Button>
                  </div>
                ) : (
                  <>
                    <table className="issue-table">
                      <caption className="visually-hidden">
                        {archived ? "Issue archiviate" : "Issue correnti"}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Numero e titolo</th>
                          <th scope="col">Stato / priorità</th>
                          <th scope="col">Responsabile</th>
                          <th scope="col" className="tablet-hidden">
                            Scadenza
                          </th>
                          <th scope="col" className="tablet-hidden">
                            Creata il
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.data.items.map((issue) => (
                          <tr key={issue.id}>
                            <td className="title-cell">
                              {issueLink(issue)}
                              <small>
                                {typeNames[issue.type]}
                                {issue.archived &&
                                  ` · Archiviata il ${dateTime(issue.archivedAt!)} da ${userName(issue.archivedBy)}`}
                              </small>
                              <div className="badge-group">
                                {issue.labels.map((label) => (
                                  <span
                                    key={label.id}
                                    className={`badge badge-${label.color.toLowerCase()}`}
                                  >
                                    {label.name}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              {statusNames[issue.status]}
                              <br />
                              {priorityNames[issue.priority]}
                            </td>
                            <td>{userName(issue.assignee)}</td>
                            <td className="tablet-hidden">
                              {dateOnly(issue.dueDate)}
                              {!issue.archived &&
                                ["TODO", "IN_PROGRESS"].includes(
                                  issue.status,
                                ) &&
                                issue.dueDate &&
                                issue.dueDate < todayRome() && (
                                  <span className="overdue-text">
                                    {" "}
                                    · Scaduta
                                  </span>
                                )}
                            </td>
                            <td className="tablet-hidden">
                              {dateTime(issue.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="issue-cards">
                      {list.data.items.map((issue) => (
                        <article key={issue.id} className="panel issue-card">
                          <h2>{issueLink(issue)}</h2>
                          <IssueBadges issue={issue} />
                          <p>
                            Assegnata a {userName(issue.assignee)}
                            <br />
                            Scadenza: {dateOnly(issue.dueDate)}
                          </p>
                          {!issue.archived &&
                            ["TODO", "IN_PROGRESS"].includes(issue.status) &&
                            issue.dueDate &&
                            issue.dueDate < todayRome() && (
                              <p className="overdue-text">
                                Scaduta il {dateOnly(issue.dueDate)}
                              </p>
                            )}
                          {issue.archived && (
                            <p>
                              Archiviata il {dateTime(issue.archivedAt!)} da{" "}
                              {userName(issue.archivedBy)}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  </>
                )}
                <Pagination
                  {...list.data}
                  onPageChange={(page) => changeParam("page", String(page))}
                  onSizeChange={(size) => changeParam("size", String(size))}
                />
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
