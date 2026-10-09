import {
  IconPlus,
  IconSearch,
  IconFilter,
  IconDownload,
  IconX,
  IconSortAscending,
} from "../../components/Icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { IssueSummary } from "../../api/types";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { SelectControl } from "../../components/SelectField";
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
  IssuePriorityIcon,
  IssueLabels,
} from "./IssueBadges";
import { IssueBoard } from "./IssueBoard";
import { IssuePerson } from "./IssuePerson";
import "./styles.css";

const filterNames: Record<string, string> = {
  q: "Ricerca",
  type: "Tipo",
  status: "Stato",
  priority: "Priorità",
  labelId: "Etichetta",
  assignedTo: "Responsabile",
  reporterId: "Reporter",
  overdue: "Scadenza",
};
const sortOptions = {
  priority: "Priorità",
  createdAt: "Data creazione",
  updatedAt: "Data modifica",
  lastActivityAt: "Ultima attività",
  dueDate: "Scadenza",
  title: "Titolo",
  number: "Numero issue",
};
const sortDirections: Record<string, { asc: string; desc: string }> = {
  priority: { asc: "Più bassa prima", desc: "Più alta prima" },
  createdAt: { asc: "Meno recenti prima", desc: "Più recenti prima" },
  updatedAt: { asc: "Meno recenti prima", desc: "Più recenti prima" },
  lastActivityAt: { asc: "Meno recenti prima", desc: "Più recenti prima" },
  dueDate: { asc: "Più vicine prima", desc: "Più lontane prima" },
  title: { asc: "A → Z", desc: "Z → A" },
  number: { asc: "Più basso prima", desc: "Più alto prima" },
};

export function IssueListPage({ archived = false }: { archived?: boolean }) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, getDraft, setDraft: setMemoryDraft } = useAuth();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const [exportSuccess, setExportSuccess] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterPosition, setFilterPosition] = useState({
    left: 12,
    top: 80,
    width: 280,
    maxHeight: 560,
  });
  const board = useRef<HTMLDivElement>(null);
  const filterMenu = useRef<HTMLDivElement>(null);
  const restoredPosition = useRef<string | null>(null);
  const query = params.toString();
  const confirmedSearch = params.get("q") ?? "";
  useEffect(() => setSearch(confirmedSearch), [confirmedSearch]);
  useEffect(() => {
    if (!filtersOpen) return;
    const outside = (event: PointerEvent) => {
      if (
        !(
          event.target instanceof Element &&
          event.target.closest('[role="listbox"], .select-popover')
        ) &&
        !filterMenu.current?.contains(event.target as Node)
      )
        setFiltersOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        filterMenu.current
          ?.querySelector<HTMLButtonElement>(".issue-filter-toggle")
          ?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [filtersOpen]);
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
  if (!apiParams.has("sort")) apiParams.set("sort", "priority,desc");
  const list = useQuery({
    queryKey: ["issues", "list", archived, query],
    queryFn: async ({ signal }) => {
      const request = new URLSearchParams(apiParams);
      if (archived) return issueApi.list(request.toString(), signal);
      // The board represents the whole result set, never an arbitrary server page.
      request.set("page", "0");
      request.set("size", "100");
      const first = await issueApi.list(request.toString(), signal);
      const items = new Map(first.items.map((issue) => [issue.id, issue]));
      for (let page = 1; page < first.totalPages; page += 4) {
        signal.throwIfAborted();
        const pages = await Promise.all(
          Array.from(
            { length: Math.min(4, first.totalPages - page) },
            (_, offset) => {
              const pageRequest = new URLSearchParams(request);
              pageRequest.set("page", String(page + offset));
              return issueApi.list(pageRequest.toString(), signal);
            },
          ),
        );
        signal.throwIfAborted();
        for (const next of pages)
          next.items.forEach((issue) => items.set(issue.id, issue));
      }
      return { ...first, items: [...items.values()], page: 0, totalPages: 1 };
    },
    enabled: !!parsed.value,
    placeholderData: keepPreviousData,
  });
  useEffect(() => {
    const key = location.pathname + location.search;
    if (!list.data || restoredPosition.current === key) return;
    const state = location.state as {
      restoreScrollY?: number;
      focusIssueId?: string;
      boardScrollLeft?: number;
      focusNewIssue?: boolean;
    } | null;
    const position =
      state?.restoreScrollY ?? getDraft<number>(`list-scroll:${key}`);
    let finalFrame = 0;
    const frame = requestAnimationFrame(() => {
      // Restore after the router has focused the newly rendered page heading.
      finalFrame = requestAnimationFrame(() => {
        restoredPosition.current = key;
        if (position === undefined) return;
        const id = state?.focusIssueId ?? getDraft<string>(`list-focus:${key}`);
        const focusNewIssue =
          state?.focusNewIssue ?? getDraft<boolean>(`list-focus-new:${key}`);
        const link = id
          ? document.querySelector<HTMLAnchorElement>(
              `a[data-issue-id="${id}"]`,
            )
          : null;
        if (focusNewIssue)
          document
            .querySelector<HTMLAnchorElement>(".issue-create-link")
            ?.focus({ preventScroll: true });
        else link?.focus({ preventScroll: true });
        if (board.current)
          board.current.scrollLeft =
            state?.boardScrollLeft ??
            getDraft<number>(`list-board-scroll:${key}`) ??
            0;
        window.scrollTo({ top: position, behavior: "instant" });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(finalFrame);
    };
  }, [list.data, location.pathname, location.search, location.state, getDraft]);
  const labels = useQuery({
    queryKey: ["labels", "active"],
    queryFn: ({ signal }) => getLabels(signal),
  });
  const directory = useQuery({
    queryKey: ["users", "directory"],
    queryFn: ({ signal }) => getDirectory(signal),
  });
  function changeParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }
  function applySearch(event: FormEvent) {
    event.preventDefault();
    changeParam("q", normalized(search));
  }
  function clearFilters() {
    const next = new URLSearchParams(params);
    for (const key of Object.keys(filterNames))
      if (key !== "assignedTo" || params.get(key) !== "me") next.delete(key);
    next.delete("page");
    setParams(next);
  }
  function removeFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    const remaining = next.getAll(key).filter((item) => item !== value);
    next.delete(key);
    remaining.forEach((item) => next.append(key, item));
    next.delete("page");
    setParams(next);
  }
  function filterValue(key: string, value: string) {
    return (
      (
        { ...typeNames, ...statusNames, ...priorityNames } as Record<
          string,
          string
        >
      )[value] ??
      labels.data?.find((label) => label.id === value)?.name ??
      directory.data?.find((person) => person.id === value)?.displayName ??
      (key === "overdue"
        ? value === "true"
          ? "Scadute"
          : "Non scadute"
        : (
            { me: "Assegnate a me", unassigned: "Non assegnata" } as Record<
              string,
              string
            >
          )[value]) ??
      value
    );
  }
  const activeFilters = [...params.entries()].filter(
    ([key, value]) =>
      key in filterNames &&
      !(key === "assignedTo" && value === "me" && !archived),
  );
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
      setExportSuccess("CSV esportato.");
    } catch (error) {
      setExportError(error);
    } finally {
      setExporting(false);
    }
  }
  function openIssueRoute(
    event: MouseEvent<HTMLAnchorElement>,
    issue?: IssueSummary,
  ) {
    // Preserve browser behavior for new tabs and modified clicks.
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    const returnTo = location.pathname + location.search;
    const context = {
      returnTo,
      scrollY: window.scrollY,
      focusIssueId: issue?.id,
      focusNewIssue: !issue,
      boardScrollLeft: board.current?.scrollLeft ?? 0,
    };
    setMemoryDraft(`list-focus:${returnTo}`, issue?.id ?? "");
    setMemoryDraft(`list-focus-new:${returnTo}`, !issue);
    setMemoryDraft(`list-scroll:${returnTo}`, context.scrollY);
    setMemoryDraft(`list-board-scroll:${returnTo}`, context.boardScrollLeft);
    navigate(issue ? `/issues/${issue.id}` : "/issues/new", { state: context });
  }
  const linkState = { returnTo: location.pathname + location.search };
  const focusIssueId =
    (location.state as { focusIssueId?: string } | null)?.focusIssueId ??
    getDraft<string>(`list-focus:${linkState.returnTo}`);
  function scopeLink(mine: boolean) {
    const next = new URLSearchParams(params);
    next.delete("page");
    if (mine) next.set("assignedTo", "me");
    else next.delete("assignedTo");
    return `/issues${next.size ? "?" + next : ""}`;
  }
  const selectedSort = params.get("sort") ?? "priority,desc";
  const [sortField, sortDirection] = selectedSort.split(",");
  const directionNames = sortDirections[sortField];
  return (
    <section className="issue-list-page">
      <div className="issue-heading">
        <div>
          <h1 tabIndex={-1}>{archived ? "Archivio" : "Issue"}</h1>
          {archived && (
            <p>Segnalazioni archiviate, disponibili per la consultazione.</p>
          )}
        </div>
        <div className="actions">
          <Button
            className="issue-export"
            busy={exporting}
            onClick={() => void exportCsv()}
          >
            <IconDownload size={16} aria-hidden="true" /> Esporta
          </Button>
          {!archived && user?.role !== "VIEWER" && (
            <Link
              className="button button-primary issue-create-link"
              to="/issues/new"
              state={linkState}
              onClick={(event) => openIssueRoute(event)}
            >
              <IconPlus size={16} aria-hidden="true" /> Nuova issue
            </Link>
          )}
        </div>
      </div>
      {!archived && (
        <nav className="work-tabs" aria-label="Vista issue">
          <Link
            className={`work-tab ${params.get("assignedTo") !== "me" ? "active" : ""}`}
            aria-current={
              params.get("assignedTo") !== "me" ? "page" : undefined
            }
            to={scopeLink(false)}
          >
            Tutte
          </Link>
          {user?.role !== "VIEWER" && (
            <Link
              className={`work-tab ${params.get("assignedTo") === "me" ? "active" : ""}`}
              aria-current={
                params.get("assignedTo") === "me" ? "page" : undefined
              }
              to={scopeLink(true)}
            >
              Assegnate a me
            </Link>
          )}
        </nav>
      )}
      {parsed.error ? (
        <>
          <ErrorAlert error={parsed.error} />
          <Button onClick={() => setParams({})}>Ripristina vista</Button>
        </>
      ) : (
        <>
          <div className="issue-list-toolbar">
            <form className="issue-search-form" onSubmit={applySearch}>
              <label className="filter-search">
                <IconSearch size={16} aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Cerca issue"
                  placeholder="Cerca nel titolo o nella descrizione"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <Button
                type="submit"
                className="issue-search-submit"
                tabIndex={-1}
                aria-label="Cerca"
              >
                <IconSearch size={16} aria-hidden="true" />
              </Button>
            </form>
            <div className="issue-filter-menu" ref={filterMenu}>
              <Button
                className="issue-filter-toggle"
                aria-label="Filtri"
                aria-expanded={filtersOpen}
                aria-controls="issue-filter-fields"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const width = Math.min(
                    window.innerWidth <= 620 ? 260 : 280,
                    window.innerWidth - 24,
                  );
                  const top = Math.max(
                    12,
                    Math.min(rect.bottom + 8, window.innerHeight - 180),
                  );
                  setFilterPosition({
                    left: Math.max(
                      12,
                      Math.min(rect.left, window.innerWidth - width - 12),
                    ),
                    top,
                    width,
                    maxHeight: Math.min(560, window.innerHeight - top - 12),
                  });
                  setFiltersOpen((value) => !value);
                }}
              >
                <IconFilter size={16} aria-hidden="true" /> Filtri
                {activeFilters.filter(([key]) => key !== "q").length > 0 && (
                  <span className="issue-filter-count">
                    {activeFilters.filter(([key]) => key !== "q").length}
                  </span>
                )}
              </Button>
              {filtersOpen && (
                <div
                  id="issue-filter-fields"
                  className="issue-filter-fields"
                  style={filterPosition}
                >
                  {Object.entries({
                    type: typeNames,
                    status: statusNames,
                    priority: priorityNames,
                  }).map(([key, values]) => (
                    <label className="field" key={key}>
                      <span>{filterNames[key]}</span>
                      <SelectControl
                        aria-label={filterNames[key]}
                        value={params.get(key) ?? ""}
                        leadingVisual={
                          key === "priority"
                            ? (value) => value ? (
                              <IssuePriorityIcon priority={value as IssueSummary["priority"]} />
                            ) : null
                            : undefined
                        }
                        onChange={(event) =>
                          changeParam(key, event.target.value)
                        }
                      >
                        <option value="">Tutti</option>
                        {Object.entries(values).map(([value, text]) => (
                          <option key={value} value={value}>
                            {text}
                          </option>
                        ))}
                      </SelectControl>
                    </label>
                  ))}
                  <label className="field">
                    <span>Responsabile</span>
                    <SelectControl
                      aria-label="Responsabile"
                      value={params.get("assignedTo") ?? ""}
                      leadingVisual={(value) => {
                        const person = directory.data?.find(
                          (item) => item.id === value,
                        );
                        return person ? (
                          <Avatar
                            name={person.displayName}
                            id={person.id}
                            size={20}
                          />
                        ) : null;
                      }}
                      onChange={(event) =>
                        changeParam("assignedTo", event.target.value)
                      }
                    >
                      <option value="">Tutti</option>
                      {user?.role !== "VIEWER" && (
                        <option value="me">Assegnate a me</option>
                      )}
                      <option value="unassigned">Non assegnata</option>
                      {directory.data?.map((person) => (
                        <option key={person.id} value={person.id}>
                          {userName(person)}
                        </option>
                      ))}
                    </SelectControl>
                  </label>
                  <label className="field">
                    <span>Etichetta</span>
                    <SelectControl
                      aria-label="Etichetta"
                      value={params.get("labelId") ?? ""}
                      leadingVisual={(value) => {
                        const label = labels.data?.find(
                          (item) => item.id === value,
                        );
                        return label ? (
                          <span
                            className={`label-dot label-dot-${label.color.toLowerCase()}`}
                          />
                        ) : null;
                      }}
                      onChange={(event) =>
                        changeParam("labelId", event.target.value)
                      }
                    >
                      <option value="">Tutte</option>
                      {labels.data?.map((label) => (
                        <option key={label.id} value={label.id}>
                          {label.name}
                        </option>
                      ))}
                    </SelectControl>
                  </label>
                  <label className="field">
                    <span>Scadenza</span>
                    <SelectControl
                      aria-label="Scadenza"
                      value={params.get("overdue") ?? ""}
                      onChange={(event) =>
                        changeParam("overdue", event.target.value)
                      }
                    >
                      <option value="">Qualsiasi</option>
                      <option value="true">Scadute</option>
                      <option value="false">Non scadute</option>
                    </SelectControl>
                  </label>
                  <ErrorAlert error={labels.error ?? directory.error} />
                  <Button variant="link" onClick={clearFilters}>
                    Pulisci filtri
                  </Button>
                </div>
              )}
            </div>
            <div className="issue-sort-controls">
              <label className="issue-sort-field">
                <span>Ordina</span>
                <span className="issue-sort-choice">
                  <IconSortAscending size={16} aria-hidden="true" />
                  <SelectControl
                    aria-label="Ordina issue"
                    value={sortField}
                    onChange={(event) =>
                      changeParam(
                        "sort",
                        `${event.target.value},${sortDirection}`,
                      )
                    }
                  >
                    {Object.entries(sortOptions).map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </SelectControl>
                </span>
              </label>
              <label className="issue-sort-field issue-sort-direction">
                <span>Direzione</span>
                <SelectControl
                  aria-label="Direzione ordinamento"
                  value={sortDirection}
                  onChange={(event) =>
                    changeParam("sort", `${sortField},${event.target.value}`)
                  }
                >
                  <option value="asc">{directionNames.asc}</option>
                  <option value="desc">{directionNames.desc}</option>
                </SelectControl>
              </label>
            </div>
          </div>
          <div className="issue-active-filters" role="group" aria-label="Filtri attivi">
            {activeFilters.map(([key, value]) => (
              <button
                type="button"
                className="filter-chip"
                key={key + value}
                aria-label={`Rimuovi filtro ${filterNames[key]}: ${filterValue(key, value)}`}
                onClick={() => removeFilter(key, value)}
              >
                <span>
                  {filterNames[key]}: {filterValue(key, value)}
                </span>
                <IconX size={14} aria-hidden="true" />
              </button>
            ))}
            {activeFilters.length > 0 && (
              <Button variant="link" onClick={clearFilters}>
                Azzera tutti
              </Button>
            )}
          </div>
          <ErrorAlert error={exportError} />
          {exportSuccess && <Alert variant="success">{exportSuccess}</Alert>}
          {list.isFetching && list.data && (
            <p className="issue-loading-note" role="status">
              Aggiornamento delle issue…
            </p>
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
                {archived ? (
                  list.data.items.length ? (
                    <div className="issue-archive-list">
                      {list.data.items.map((issue) => (
                        <Link
                          key={issue.id}
                          to={`/issues/${issue.id}`}
                          data-issue-id={issue.id}
                          aria-label={`BB-${issue.number} · ${issue.title}`}
                          onClick={(event) => openIssueRoute(event, issue)}
                          state={linkState}
                          className="issue-archive-row"
                        >
                          <IssueTypeIcon type={issue.type} size={16} />
                          <span className="issue-number">
                            BB-{issue.number}
                          </span>
                          <span className="archive-title">
                            {issue.title}
                            <small>
                              Archiviata il {dateTime(issue.archivedAt!)} da{" "}
                              {userName(issue.archivedBy)}
                            </small>
                          </span>
                          <IssueLabels issue={issue} />
                          <IssuePriorityBadge priority={issue.priority} />
                          <span className="archive-date">
                            {issue.dueDate ? dateOnly(issue.dueDate) : ""}
                          </span>
                          <IssuePerson user={issue.assignee} />
                          <IssueStatusBadge status={issue.status} />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <h2>
                        {list.data.totalElements > 0
                          ? "Pagina fuori intervallo"
                          : "Nessuna issue in questa vista"}
                      </h2>
                      <p>Prova una ricerca diversa o rimuovi i filtri.</p>
                      <Button
                        onClick={() =>
                          list.data!.totalElements > 0
                            ? changeParam("page", "0")
                            : clearFilters()
                        }
                      >
                        {list.data.totalElements > 0
                          ? "Prima pagina"
                          : "Pulisci filtri"}
                      </Button>
                    </div>
                  )
                ) : (
                  <IssueBoard
                    key={linkState.returnTo}
                    issues={list.data.items}
                    boardRef={board}
                    onOpenIssue={openIssueRoute}
                    linkState={linkState}
                    focusIssueId={focusIssueId}
                  />
                )}
                <footer className="issue-results-footer">
                  <span role="status" aria-live="polite" aria-atomic="true">
                    {list.data.totalElements} issue
                    {list.isPlaceholderData ? " · aggiornamento…" : ""}
                  </span>
                </footer>
                {archived && list.data.totalPages > 1 && (
                  <div className="issue-list-pagination">
                    <IssueListPagination
                      {...list.data}
                      onPageChange={(page) => changeParam("page", String(page))}
                      onSizeChange={(size) => changeParam("size", String(size))}
                    />
                  </div>
                )}
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
