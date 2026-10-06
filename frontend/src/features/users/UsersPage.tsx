import { useState } from "react";
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
import type { UserAdmin, UserRole } from "../../api/types";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { LoadingState } from "../../components/LoadingState";
import { Pagination } from "../../components/Pagination";
import { SelectField } from "../../components/SelectField";
import { TextField } from "../../components/TextField";
import "./admin.css";

function Filters({
  filters,
  apply,
}: {
  filters: AdminFilters;
  apply: (query: URLSearchParams) => void;
}) {
  const [q, setQ] = useState(filters.q),
    [role, setRole] = useState(filters.role),
    [active, setActive] = useState(filters.active),
    [error, setError] = useState<string | undefined>();
  function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = normalizedName(q, 0, 100);
    setError(invalid ?? undefined);
    if (invalid) return;
    const query = new URLSearchParams();
    if (q.trim()) query.set("q", q.normalize("NFC").trim());
    if (role) query.set("role", role);
    if (active) query.set("active", active);
    if (filters.size !== 20) query.set("size", String(filters.size));
    apply(query);
  }
  return (
    <form className="panel admin-filters" onSubmit={submit}>
      <TextField
        label="Cerca nome o email"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        error={error}
      />
      <SelectField
        label="Ruolo"
        value={role}
        onChange={(event) => setRole(event.target.value)}
      >
        <option value="">Tutti i ruoli</option>
        {Object.entries(roleNames).map(([value, name]) => (
          <option key={value} value={value}>
            {name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Stato account"
        value={active}
        onChange={(event) => setActive(event.target.value)}
      >
        <option value="">Tutti gli stati</option>
        <option value="true">Attivo</option>
        <option value="false">Inattivo</option>
      </SelectField>
      <div className="actions">
        <Button type="submit" variant="primary">
          Applica filtri
        </Button>
        <Button onClick={() => apply(new URLSearchParams())}>
          Pulisci filtri
        </Button>
      </div>
    </form>
  );
}
function AccountCard({ user }: { user: UserAdmin }) {
  return (
    <article className="panel admin-card">
      <h2>{user.displayName}</h2>
      <dl>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Ruolo</dt>
        <dd>{roleNames[user.role]}</dd>
        <dt>Stato</dt>
        <dd>{user.active ? "Attivo" : "Inattivo"}</dd>
        <dt>Cambio password</dt>
        <dd>{user.mustChangePassword ? "Richiesto" : "Completato"}</dd>
      </dl>
      <Link className="button" to={`/admin/users/${user.id}/edit`}>
        Gestisci {user.displayName}
      </Link>
    </article>
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
    <section>
      <div className="admin-heading">
        <div>
          <h1 tabIndex={-1}>Utenti</h1>
          <p className="muted">Account, ruoli e accesso al progetto.</p>
        </div>
        <Link className="button button-primary" to="/admin/users/new">
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
            key={params.toString()}
            filters={filters}
            apply={setParams}
          />
          <ErrorAlert error={snapshot.error} />
          {snapshot.isPending ? (
            <LoadingState />
          ) : (
            snapshot.data && (
              <div aria-busy={snapshot.isFetching}>
                <p role="status">
                  {snapshot.isFetching ? "Aggiornamento in corso. " : ""}
                  {snapshot.data.data.totalElements} risultati
                  {snapshot.isPlaceholderData &&
                    " · risultati dei filtri precedenti"}
                </p>
                {snapshot.data.data.items.length === 0 ? (
                  <div className="panel">
                    <p>Nessun utente corrisponde ai filtri.</p>
                    <Button onClick={() => setParams(new URLSearchParams())}>
                      Pulisci filtri
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="panel admin-desktop-list admin-table-wrap">
                      <table className="admin-table">
                        <caption>Account del progetto</caption>
                        <thead>
                          <tr>
                            {[
                              "Nome",
                              "Email",
                              "Ruolo",
                              "Stato",
                              "Cambio password",
                              "Azioni",
                            ].map((title) => (
                              <th key={title} scope="col">
                                {title}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.data.data.items.map((user) => (
                            <tr key={user.id}>
                              <th scope="row">{user.displayName}</th>
                              <td>{user.email}</td>
                              <td>{roleNames[user.role as UserRole]}</td>
                              <td>{user.active ? "Attivo" : "Inattivo"}</td>
                              <td>
                                {user.mustChangePassword
                                  ? "Richiesto"
                                  : "Completato"}
                              </td>
                              <td>
                                <Link to={`/admin/users/${user.id}/edit`}>
                                  Gestisci {user.displayName}
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="admin-cards">
                      {snapshot.data.data.items.map((user) => (
                        <AccountCard key={user.id} user={user} />
                      ))}
                    </div>
                  </>
                )}
                <Pagination
                  page={snapshot.data.data.page}
                  size={snapshot.data.data.size}
                  totalPages={snapshot.data.data.totalPages}
                  totalElements={snapshot.data.data.totalElements}
                  onPageChange={(page) => paginate(page)}
                  onSizeChange={(size) => paginate(0, size)}
                />
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}
