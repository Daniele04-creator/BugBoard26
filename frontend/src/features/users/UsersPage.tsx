import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { userApi } from "./userApi";
import {
  normalizedName,
  parseAdminFilters,
  roleNames,
} from "./adminPresentation";
import type { AdminFilters } from "./adminPresentation";
import type { UserRole } from "../../api/types";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/LoadingState";
import { Pagination } from "../../components/Pagination";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import "./admin.css";
import { Avatar } from "../../components/Avatar";
import { IconPlus, IconChevronRight } from "../../components/Icons";

function Filters({
  filters,
  apply,
}: {
  filters: AdminFilters;
  apply: (query: URLSearchParams) => void;
}) {
  const [q, setQ] = useState(filters.q);
  const [error, setError] = useState<string | undefined>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setQ(filters.q); }, [filters.q]);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  function update(value = q, role = filters.role, active = filters.active) {
    clearTimeout(searchTimer.current);
    const invalid = normalizedName(value, 0, 100);
    setError(invalid ?? undefined);
    if (invalid) return;
    const query = new URLSearchParams();
    if (value.trim()) query.set("q", value.normalize("NFC").trim());
    if (role) query.set("role", role);
    if (active) query.set("active", active);
    if (filters.size !== 20) query.set("size", String(filters.size));
    apply(query);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    clearTimeout(searchTimer.current);
    update();
  }
  return (
    <form className="admin-filters admin-user-filters" onSubmit={submit}>
      <TextField label="Cerca nome o email" type="search" placeholder="Cerca nel team…"
        value={q} onChange={(event) => {
          const value = event.target.value;
          setQ(value);
          clearTimeout(searchTimer.current);
          searchTimer.current = setTimeout(() => update(value), 300);
        }} error={error} />
      <SelectField label="Ruolo" value={filters.role} onChange={(event) => update(q, event.target.value)}>
        <option value="">Tutti i ruoli</option>
        {Object.entries(roleNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </SelectField>
      <SelectField label="Stato account" value={filters.active} onChange={(event) => update(q, filters.role, event.target.value)}>
        <option value="">Tutti</option><option value="true">Attivi</option><option value="false">Inattivi</option>
      </SelectField>
      <Button variant="link" onClick={() => { clearTimeout(searchTimer.current); setQ(""); apply(new URLSearchParams()); }}>Pulisci</Button>
    </form>
  );
}

export function UsersPage() {
  const [params, setParams] = useSearchParams(),
    filters = parseAdminFilters(params);
  const query = new URLSearchParams(params);
  query.set("page", String(filters.page));
  query.set("size", String(filters.size));
  const snapshot = useQuery({
    queryKey: ["admin-users", query.toString()],
    queryFn: async ({ signal }) => ({
      data: await userApi.list(query.toString(), signal),
      query: params.toString(),
    }),
    enabled: filters.valid,
    placeholderData: keepPreviousData,
  });
  function paginate(page: number, size = filters.size) {
    const next = new URLSearchParams(params);
    if (page) next.set("page", String(page));
    else next.delete("page");
    if (size !== 20) next.set("size", String(size));
    else next.delete("size");
    setParams(next);
  }
  return (
    <section className="users-page">
      <div className="admin-heading">
        <div>
          <h1 tabIndex={-1}>Team</h1>
          <p className="muted">{snapshot.data ? `${snapshot.data.data.totalElements} account nel progetto` : "Account del progetto"}</p>
        </div>
        <Link className="button button-primary" to="/admin/users/new">
          <IconPlus size={20} stroke={2} aria-hidden="true" />
          Nuovo utente
        </Link>
      </div>
      {!filters.valid ? (
        <Alert>
          Filtri non validi.{" "}
          <Button onClick={() => setParams(new URLSearchParams())}>
            Ripristina vista
          </Button>
        </Alert>
      ) : (
        <>
          <Filters
            filters={filters}
            apply={setParams}
          />
          <ErrorAlert error={snapshot.error} />
          {snapshot.isPending ? (
            <LoadingState />
          ) : (
            snapshot.data && (
              <div aria-busy={snapshot.isFetching}>

                {snapshot.data.data.items.length === 0 ? (
                  <div className="panel">
                    <p>Nessun utente corrisponde ai filtri.</p>
                    <Button onClick={() => setParams(new URLSearchParams())}>
                      Pulisci filtri
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="admin-register admin-table-wrap" role="region" tabIndex={0} aria-label="Team del progetto">
                      <table className="admin-table admin-users-table">
                        <caption className="visually-hidden">Account del progetto</caption>
                        <thead>
                          <tr>
                            {[
                              "Persona",
                              "Ruolo",
                              "Stato",
                              "Azioni",
                            ].map((title) => (
                              <th key={title} scope="col">
                                {title === "Azioni" ? <span className="sr-only">Azioni</span> : title}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.data.data.items.map((user) => (
                            <tr key={user.id}>
                              <th scope="row"><span className="admin-person"><Avatar name={user.displayName} id={user.id} /><span><strong>{user.displayName}</strong><span className="admin-person-email">{user.email}</span>{user.mustChangePassword && <span className="password-required">Cambio password richiesto</span>}</span></span></th>
                              <td>{roleNames[user.role as UserRole]}</td>
                              <td><span className={`account-state ${user.active ? "" : "inactive"}`}>{user.active ? "Attivo" : "Inattivo"}</span></td>
                              <td>
                                <Link aria-label={`Gestisci ${user.displayName}`} to={`/admin/users/${user.id}/edit`}>
                                  Gestisci <IconChevronRight size={14} aria-hidden="true" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <p className="admin-results-status" role="status">
                  {snapshot.isFetching ? "Aggiornamento in corso. " : ""}
                  {snapshot.data.data.totalElements} risultati
                  {snapshot.isPlaceholderData &&
                    " · risultati dei filtri precedenti"}
                </p>
                {snapshot.data.data.totalPages > 1 && <Pagination
                  page={snapshot.data.data.page}
                  size={snapshot.data.data.size}
                  totalPages={snapshot.data.data.totalPages}
                  totalElements={snapshot.data.data.totalElements}
                  onPageChange={(page) => paginate(page)}
                  onSizeChange={(size) => paginate(0, size)}
                />}
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
