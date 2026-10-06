import { Fragment, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Label, LabelColor } from "../../api/types";
import { ApiError } from "../../api/ApiClient";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Dialog } from "../../components/Dialog";
import { TextField } from "../../components/TextField";
import { SelectField } from "../../components/SelectField";
import { LoadingState } from "../../components/LoadingState";
import { Pagination } from "../../components/Pagination";
import {
  fieldErrors,
  normalizedName,
  parseAdminFilters,
  useMobileCards,
} from "../users/adminPresentation";
import { labelApi } from "./labelApi";
import { UnsavedChanges } from "../issues/UnsavedChanges";
import "../users/admin.css";
const colors: Record<LabelColor, string> = {
  gray: "Grigio",
  blue: "Blu",
  green: "Verde",
  amber: "Ambra",
  red: "Rosso",
  purple: "Viola",
};
function ColorField({
  value,
  onChange,
}: {
  value: LabelColor;
  onChange: (color: LabelColor) => void;
}) {
  return (
    <SelectField
      label="Colore"
      value={value}
      onChange={(event) => onChange(event.target.value as LabelColor)}
    >
      {Object.entries(colors).map(([color, name]) => (
        <option key={color} value={color}>
          {name}
        </option>
      ))}
    </SelectField>
  );
}
function Filters({
  query,
  active,
  apply,
}: {
  query: string;
  active: string;
  apply: (q: string, a: string) => void;
}) {
  const [q, setQ] = useState(query),
    [state, setState] = useState(active),
    [error, setError] = useState<string | undefined>();
  return (
    <form
      className="panel admin-filters"
      onSubmit={(event) => {
        event.preventDefault();
        const invalid = normalizedName(q, 0, 100);
        setError(invalid ?? undefined);
        if (invalid) return;
        apply(q.normalize("NFC").trim(), state);
      }}
    >
      <TextField
        label="Cerca etichetta"
        value={q}
        onChange={(event) => setQ(event.target.value)}
        error={error}
      />
      <SelectField
        label="Stato etichetta"
        value={state}
        onChange={(event) => setState(event.target.value)}
      >
        <option value="all">Tutte</option>
        <option value="true">Attive</option>
        <option value="false">Inattive</option>
      </SelectField>
      <div className="actions">
        <Button type="submit" variant="primary">
          Applica filtri
        </Button>
        <Button onClick={() => apply("", "all")}>Pulisci filtri</Button>
      </div>
    </form>
  );
}
export function LabelsPage() {
  const mobile = useMobileCards();
  const cache = useQueryClient(),
    [params, setParams] = useSearchParams(),
    filters = parseAdminFilters(params, true);
  const query = new URLSearchParams(params);
  query.set("active", filters.active);
  query.set("page", String(filters.page));
  query.set("size", String(filters.size));
  const list = useQuery({
    queryKey: ["labels", "admin", query.toString()],
    queryFn: ({ signal }) => labelApi.list(query.toString(), signal),
    enabled: filters.valid,
    placeholderData: keepPreviousData,
  });
  const [newName, setNewName] = useState(""),
    [newColor, setNewColor] = useState<LabelColor>("blue"),
    [editing, setEditing] = useState<Label | null>(null),
    [name, setName] = useState(""),
    [color, setColor] = useState<LabelColor>("blue");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [nameError, setNameError] = useState<string | undefined>(),
    [newError, setNewError] = useState<unknown>(null),
    [newField, setNewField] = useState<string | undefined>(),
    [success, setSuccess] = useState("");
  const [toggle, setToggle] = useState<Label | null>(null),
    [latest, setLatest] = useState<Label | null>(null),
    [conflict, setConflict] = useState(false),
    [conflictError, setConflictError] = useState<unknown>(null),
    [loadingLatest, setLoadingLatest] = useState(false);
  function apply(q: string, active: string) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (active !== "all") next.set("active", active);
    if (filters.size !== 20) next.set("size", String(filters.size));
    setParams(next);
  }
  function paginate(page: number, size = filters.size) {
    const next = new URLSearchParams(params);
    if (page) next.set("page", String(page));
    else next.delete("page");
    if (size !== 20) next.set("size", String(size));
    else next.delete("size");
    setParams(next);
  }
  async function invalidate() {
    await cache.invalidateQueries({ queryKey: ["labels"] });
    await cache.invalidateQueries({ queryKey: ["issues"] });
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const invalid = normalizedName(newName, 1, 32);
    setNewField(invalid ?? undefined);
    setNewError(null);
    if (invalid) return;
    setBusy(true);
    setSuccess("");
    try {
      await labelApi.create(newName.normalize("NFC").trim(), newColor);
      setNewName("");
      setSuccess("Etichetta creata.");
      await invalidate();
    } catch (failure) {
      setNewError(failure);
      setNewField(
        failure instanceof ApiError && failure.code === "LABEL_ALREADY_EXISTS"
          ? "Esiste già un'etichetta con questo nome."
          : fieldErrors(failure).name,
      );
    } finally {
      setBusy(false);
    }
  }
  async function refreshConflict(target: Label) {
    setLoadingLatest(true);
    setConflictError(null);
    try {
      setLatest(await labelApi.get(target.id));
    } catch (failure) {
      setConflictError(failure);
    } finally {
      setLoadingLatest(false);
    }
  }
  async function update(target: Label, active: boolean, isToggle = false) {
    if (busy) return;
    const invalid = normalizedName(isToggle ? target.name : name, 1, 32);
    setNameError(invalid ?? undefined);
    if (invalid) return;
    setBusy(true);
    setError(null);
    setSuccess("");
    try {
      await labelApi.update(target.id, {
        name: isToggle ? target.name : name.normalize("NFC").trim(),
        color: isToggle ? target.color : color,
        active,
        expectedVersion: target.version,
      });
      setEditing(null);
      setToggle(null);
      setSuccess(
        isToggle
          ? active
            ? "Etichetta riattivata."
            : "Etichetta disattivata. Le associazioni esistenti restano."
          : "Etichetta aggiornata.",
      );
      await invalidate();
    } catch (failure) {
      setError(failure);
      setNameError(
        failure instanceof ApiError && failure.code === "LABEL_ALREADY_EXISTS"
          ? "Esiste già un'etichetta con questo nome."
          : fieldErrors(failure).name,
      );
      if (failure instanceof ApiError && failure.code === "VERSION_CONFLICT") {
        setToggle(null);
        setConflict(true);
        await refreshConflict(target);
      }
    } finally {
      setBusy(false);
    }
  }
  function edit(label: Label) {
    setEditing(label);
    setName(label.name);
    setColor(label.color);
    setError(null);
    setNameError(undefined);
    setLatest(null);
  }
  const editor = editing && (
    <form
      className="panel admin-label-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void update(editing, editing.active);
      }}
      noValidate
    >
      <h2>Modifica etichetta {editing.name}</h2>
      <p>* Campo obbligatorio.</p>
      <ErrorAlert error={error} focus />
      {nameError && !error && (
        <Alert focus focusKey={nameError}>
          <a href="#edit-label-name">{nameError}</a>
        </Alert>
      )}
      <TextField
        id="edit-label-name"
        label="Nome etichetta"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={nameError}
      />
      <ColorField value={color} onChange={setColor} />
      <div className="actions">
        <Button
          type="submit"
          variant="primary"
          busy={busy}
          disabled={name === editing.name && color === editing.color}
        >
          Salva etichetta
        </Button>
        <Button disabled={busy} onClick={() => setEditing(null)}>
          Annulla modifica
        </Button>
      </div>
    </form>
  );
  function actions(label: Label) {
    return (
      <div className="actions">
        <Button
          disabled={busy}
          onClick={() => edit(label)}
          aria-label={`Modifica etichetta ${label.name}`}
        >
          Modifica
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            setToggle(label);
            setError(null);
          }}
          aria-label={`${label.active ? "Disattiva" : "Riattiva"} etichetta ${label.name}`}
        >
          {label.active ? "Disattiva" : "Riattiva"}
        </Button>
      </div>
    );
  }
  return (
    <section>
      <UnsavedChanges
        dirty={Boolean(
          newName ||
            (editing && (name !== editing.name || color !== editing.color)),
        )}
      />
      <h1 tabIndex={-1}>Etichette</h1>
      <p className="muted">
        Il catalogo del progetto. Le etichette disattivate restano sulle issue
        già associate.
      </p>
      {success && <Alert variant="success">{success}</Alert>}
      <form
        className="panel admin-form"
        onSubmit={(event) => void create(event)}
        noValidate
      >
        <h2>Nuova etichetta</h2>
        <p>* Campo obbligatorio.</p>
        <ErrorAlert error={newError} focus />
        {newField && !newError && (
          <Alert focus focusKey={newField}>
            <a href="#new-label-name">{newField}</a>
          </Alert>
        )}
        <TextField
          id="new-label-name"
          label="Nome nuova etichetta"
          required
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          error={newField}
          hint="Da 1 a 32 caratteri."
        />
        <ColorField value={newColor} onChange={setNewColor} />
        <Button type="submit" variant="primary" busy={busy}>
          Crea etichetta
        </Button>
      </form>
      {!filters.valid ? (
        <Alert>
          Filtri non validi.{" "}
          <Button onClick={() => setParams(new URLSearchParams())}>
            Ripristina vista
          </Button>
        </Alert>
      ) : (
        <>
          <div className="admin-section">
            <Filters
              key={params.toString()}
              query={filters.q}
              active={filters.active}
              apply={apply}
            />
          </div>
          <ErrorAlert error={list.error} />
          {list.isPending ? (
            <LoadingState />
          ) : (
            list.data && (
              <div aria-busy={list.isFetching}>
                <p role="status">
                  {list.isFetching ? "Aggiornamento in corso. " : ""}
                  {list.data.totalElements} etichette
                  {list.isPlaceholderData &&
                    " · risultati dei filtri precedenti"}
                </p>
                {list.data.items.length === 0 ? (
                  <p className="panel">
                    Nessuna etichetta corrisponde ai filtri. Puoi crearne una
                    con il form sopra.
                  </p>
                ) : (
                  <>
                    {!mobile && (
                      <div className="panel admin-desktop-list admin-table-wrap">
                        <table className="admin-table">
                          <caption>Catalogo etichette</caption>
                          <thead>
                            <tr>
                              <th scope="col">Nome</th>
                              <th scope="col">Colore</th>
                              <th scope="col">Stato</th>
                              <th scope="col">Azioni</th>
                            </tr>
                          </thead>
                          <tbody>
                            {list.data.items.map((label) => (
                              <Fragment key={label.id}>
                                <tr>
                                  <th scope="row">
                                    <span
                                      className={`badge badge-${label.color}`}
                                    >
                                      {label.name}
                                    </span>
                                  </th>
                                  <td>{colors[label.color]}</td>
                                  <td>
                                    {label.active ? "Attiva" : "Inattiva"}
                                  </td>
                                  <td>{actions(label)}</td>
                                </tr>
                                {editing?.id === label.id && (
                                  <tr>
                                    <td colSpan={4}>{editor}</td>
                                  </tr>
                                )}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {mobile && (
                      <div className="admin-cards">
                        {list.data.items.map((label) => (
                          <article key={label.id} className="panel admin-card">
                            <h2>
                              <span className={`badge badge-${label.color}`}>
                                {label.name}
                              </span>
                            </h2>
                            <p>
                              {colors[label.color]} ·{" "}
                              {label.active ? "Attiva" : "Inattiva"}
                            </p>
                            {actions(label)}
                            {editing?.id === label.id && editor}
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {editing &&
                  !list.data.items.some((label) => label.id === editing.id) &&
                  editor}
                <Pagination
                  page={list.data.page}
                  size={list.data.size}
                  totalElements={list.data.totalElements}
                  totalPages={list.data.totalPages}
                  onPageChange={(page) => paginate(page)}
                  onSizeChange={(size) => paginate(0, size)}
                />
              </div>
            )
          )}
        </>
      )}
      <Dialog
        open={Boolean(toggle)}
        title={toggle?.active ? "Disattiva etichetta" : "Riattiva etichetta"}
        sensitive
        busy={busy}
        onClose={() => setToggle(null)}
        footer={
          <>
            <Button data-cancel disabled={busy} onClick={() => setToggle(null)}>
              Annulla
            </Button>
            <Button
              variant="primary"
              busy={busy}
              onClick={() =>
                toggle && void update(toggle, !toggle.active, true)
              }
            >
              {toggle?.active
                ? "Conferma disattivazione"
                : "Conferma riattivazione"}
            </Button>
          </>
        }
      >
        <ErrorAlert error={error} />
        <p>
          {toggle?.active
            ? `Le associazioni di ${toggle.name} già presenti restano. L'etichetta non sarà disponibile per nuove associazioni.`
            : `${toggle?.name} tornerà disponibile per le nuove associazioni.`}
        </p>
      </Dialog>
      <Dialog
        open={conflict}
        title="Etichetta aggiornata da un altro utente"
        sensitive
        busy={loadingLatest}
        onClose={() => setConflict(false)}
      >
        <p>Nessuna modifica è stata salvata. La bozza è conservata.</p>
        <ErrorAlert error={conflictError} />
        {loadingLatest ? (
          <LoadingState />
        ) : latest ? (
          <>
            <p>
              Dati correnti: {latest.name}, {colors[latest.color]},{" "}
              {latest.active ? "attiva" : "inattiva"}.
            </p>
            <Button
              onClick={() => {
                setEditing(latest);
                setConflict(false);
                setError(null);
              }}
            >
              Mantieni la bozza e usa la versione corrente
            </Button>
            <Button
              onClick={() => {
                edit(latest);
                setConflict(false);
              }}
            >
              Scarta la bozza e carica i dati correnti
            </Button>
          </>
        ) : (
          <Button onClick={() => editing && void refreshConflict(editing)}>
            Riprova caricamento
          </Button>
        )}
        <Button data-cancel onClick={() => setConflict(false)}>
          Torna alla bozza
        </Button>
      </Dialog>
    </section>
  );
}
