import {
  IconPlus,
  IconSearch,
  IconFilter,
  IconDownload,
  IconArrowRight,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { IssueSummary } from "../../api/types";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { IssueListPagination } from "./IssueListPagination";
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
import {
  IssueTypeIcon,
  IssueStatusBadge,
  IssuePriorityBadge,
  IssueLabels,
} from "./IssueBadges";
import { IssuePerson } from "./IssuePerson";
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  function issueLink(issue: IssueSummary, compact = false) {
    return (
      <Link
        to={`/issues/${issue.id}`}
        data-issue-id={issue.id}
        className="issue-title-link"
        aria-label={`BB-${issue.number} · ${issue.title}`}
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
        <span className="issue-number">BB-{issue.number}</span>
        <IssueTypeIcon type={issue.type} />
        <span className="issue-title-copy">
          <span className="issue-title-text">{issue.title}</span>
          {compact && (
            <span className="issue-row-subtitle">
              <span>{typeNames[issue.type]}</span>
              <IssueLabels issue={issue} />
            </span>
          )}
        </span>
      </Link>
    );
  }
  const scopeParams = new URLSearchParams(params);
  scopeParams.delete("page");
  return (
    <section className="issue-list-page">
      <div className="issue-heading">
        <div>
          <h1 tabIndex={-1}>{archived ? "Archivio" : "Issue"}</h1>
        </div>
        {!archived && user?.role !== "VIEWER" && (
          <Link className="button button-primary" to="/issues/new">
            <IconPlus size={20} stroke={2} aria-hidden="true" />
            Nuova issue
          </Link>
        )}
      </div>
      <Link
        className="issue-scope-link"
        to={`${archived ? "/issues" : "/archive"}${scopeParams.size ? "?" + scopeParams : ""}`}
      >
        {archived ? "Passa alle issue correnti" : "Passa all’archivio"}
        <IconArrowRight size={20} stroke={2} aria-hidden="true" />
      </Link>
      {parsed.error ? (
        <>
          <ErrorAlert error={parsed.error} />
          <Button onClick={() => setParams({})}>Ripristina vista</Button>
        </>
      ) : (
        <>
          <form className="issue-filter-form" onSubmit={apply}>
            <div className="issue-list-toolbar">
              <div className="filter-search">
                <label htmlFor="issue-search">
                  Cerca nel titolo o nella descrizione
                  <input
                    id="issue-search"
                    value={draftParams.get("q") ?? ""}
                    onChange={(e) => setFilter("q", e.target.value)}
                  />
                </label>
                <Button
                  type="submit"
                  className="issue-search-submit"
                  aria-label="Cerca"
                >
                  <IconSearch size={20} stroke={2} aria-hidden="true" />
                </Button>
              </div>
              <Button
                className="issue-filter-toggle"
                aria-label="Filtri"
                aria-describedby="issue-active-filter-count"
                aria-expanded={filtersOpen}
                aria-controls="issue-filter-fields"
                onClick={() => setFiltersOpen((value) => !value)}
              >
                <IconFilter size={20} stroke={2} aria-hidden="true" />
                Filtri
                <span className="issue-filter-count" aria-hidden="true">
                  {
                    Array.from(params.keys()).filter(
                      (key) => !["q", "page", "size", "sort"].includes(key),
                    ).length
                  }
                </span>
                <span
                  id="issue-active-filter-count"
                  className="visually-hidden"
                >
                  {
                    Array.from(params.keys()).filter(
                      (key) => !["q", "page", "size", "sort"].includes(key),
                    ).length
                  }{" "}
                  filtri attivi
                </span>
              </Button>
              <label className="issue-sort-field">
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
              <label className="issue-direction-field">
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
              <Button
                className="issue-export"
                busy={exporting}
                onClick={() => void exportCsv()}
              >
                <IconDownload size={20} stroke={2} aria-hidden="true" />
                Esporta CSV
              </Button>
            </div>
            <div
              id="issue-filter-fields"
              className="issue-filter-fields"
              hidden={!filtersOpen}
            >
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
                <fieldset className="issue-filter-labels">
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
                    <div className="issue-table-wrapper">
                      <table className="issue-table">
                        <caption className="visually-hidden">
                          {archived ? "Issue archiviate" : "Issue correnti"}
                        </caption>
                        <colgroup>
                          <col />
                          <col className="issue-status-column" />
                          <col className="issue-priority-column" />
                          <col className="issue-assignee-column" />
                          <col className="issue-deadline-column" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th scope="col">Issue</th>
                            <th scope="col">Stato</th>
                            <th scope="col">Priorità</th>
                            <th scope="col">Responsabile</th>
                            <th scope="col">Scadenza</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.data.items.map((issue) => (
                            <tr key={issue.id}>
                              <td className="title-cell">
                                {issueLink(issue, true)}
                                {issue.archived && (
                                  <small>
                                    Archiviata il {dateTime(issue.archivedAt!)}{" "}
                                    da {userName(issue.archivedBy)}
                                  </small>
                                )}
                              </td>
                              <td>
                                <IssueStatusBadge status={issue.status} />
                              </td>
                              <td>
                                <IssuePriorityBadge priority={issue.priority} />
                              </td>
                              <td>
                                <IssuePerson user={issue.assignee} />
                              </td>
                              <td>
                                <span>{dateOnly(issue.dueDate)}</span>
                                {!issue.archived &&
                                  ["TODO", "IN_PROGRESS"].includes(
                                    issue.status,
                                  ) &&
                                  issue.dueDate &&
                                  issue.dueDate < todayRome() && (
                                    <span className="overdue-text">
                                      Scaduta
                                    </span>
                                  )}
                                <small>
                                  Creata:{" "}
                                  {dateTime(issue.createdAt).split(" ")[0]}
                                </small>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="issue-register">
                      {list.data.items.map((issue) => (
                        <article key={issue.id} className="issue-record">
                          <h2>{issueLink(issue)}</h2>
                          <span className="issue-record-type">
                            {typeNames[issue.type]}
                          </span>
                          <div className="badge-group">
                            <IssueStatusBadge status={issue.status} />
                            <IssuePriorityBadge priority={issue.priority} />
                          </div>
                          <IssueLabels issue={issue} />
                          <IssuePerson user={issue.assignee} />
                          <div className="issue-record-dates">
                            <span>Scadenza: {dateOnly(issue.dueDate)}</span>
                            {!issue.archived &&
                              ["TODO", "IN_PROGRESS"].includes(issue.status) &&
                              issue.dueDate &&
                              issue.dueDate < todayRome() && (
                                <span className="overdue-text">Scaduta</span>
                              )}
                            <small>
                              Creata: {dateTime(issue.createdAt).split(" ")[0]}
                            </small>
                          </div>
                          {issue.archived && (
                            <small>
                              Archiviata il {dateTime(issue.archivedAt!)} da{" "}
                              {userName(issue.archivedBy)}
                            </small>
                          )}
                        </article>
                      ))}
                    </div>
                  </>
                )}
                <div className="issue-list-pagination">
                  <IssueListPagination
                    {...list.data}
                    onPageChange={(page) => changeParam("page", String(page))}
                    onSizeChange={(size) => changeParam("size", String(size))}
                  />
                </div>
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
