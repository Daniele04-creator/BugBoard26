import { Fragment, useEffect, useRef, useState } from "react";
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
} from "../users/adminPresentation";
import { labelApi } from "./labelApi";
import { UnsavedChanges } from "../issues/UnsavedChanges";
import "../users/admin.css";
import "./labels.css";
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
      leadingVisual={(selected) => <span className={`label-color-swatch color-${selected}`} aria-hidden="true" />}
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
  const [q, setQ] = useState(query);
  const [error, setError] = useState<string | undefined>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setQ(query); }, [query]);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  function update(value: string, state = active) {
    clearTimeout(searchTimer.current);
    const invalid = normalizedName(value, 0, 100);
    setError(invalid ?? undefined);
    if (!invalid) apply(value.normalize("NFC").trim(), state);
  }
  return (
    <form className="admin-filters admin-label-filters" onSubmit={(event) => { event.preventDefault(); clearTimeout(searchTimer.current); update(q); }}>
      <TextField label="Cerca etichetta" type="search" placeholder="Cerca nel catalogo…" value={q} onChange={(event) => {
        const value = event.target.value; setQ(value); clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => update(value), 300);
      }} error={error} />
      <SelectField label="Stato etichetta" value={active} onChange={(event) => update(q, event.target.value)}>
        <option value="true">Attive</option><option value="false">Inattive</option><option value="all">Tutte</option>
      </SelectField>
      <Button variant="link" onClick={() => { clearTimeout(searchTimer.current); setQ(""); apply("", "true"); }}>Pulisci</Button>
    </form>
  );
}

export function LabelsPage() {
  const [discardCreate, setDiscardCreate] = useState(false);
  const cache = useQueryClient(),
    [params, setParams] = useSearchParams();
  const parsedFilters = parseAdminFilters(params, true);
  const filters = { ...parsedFilters, active: params.has("active") ? parsedFilters.active : "true" };
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
    [newColor, setNewColor] = useState<LabelColor>("gray"),
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
    [toggleDesiredActive, setToggleDesiredActive] = useState(false),
    [conflictTarget, setConflictTarget] = useState<Label | null>(null),
    [conflictIsToggle, setConflictIsToggle] = useState(false),
    [latest, setLatest] = useState<Label | null>(null),
    [conflict, setConflict] = useState(false),
    [conflictError, setConflictError] = useState<unknown>(null),
    [loadingLatest, setLoadingLatest] = useState(false);
  function apply(q: string, active: string) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (active !== "true") next.set("active", active);
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
      setNewColor("gray");
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
        setConflictTarget(target);
        setConflictIsToggle(isToggle);
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
      className="admin-label-editor"
      onSubmit={(event) => {
        event.preventDefault();
        void update(editing, editing.active);
      }}
      noValidate
    >
      <h2>Modifica etichetta {editing.name}</h2>
      <ErrorAlert error={error} focus />
      {nameError && !error && (
        <Alert focus focusKey={nameError}>
          <a href="#edit-label-name">{nameError}</a>
        </Alert>
      )}
      <div className="label-editor-fields">
        <TextField
          id="edit-label-name"
          label="Nome etichetta"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={nameError}
        />
        <ColorField value={color} onChange={setColor} />
      </div>
      <div className="label-live-preview"><span>Anteprima</span><span className={`badge badge-${color}`}>{name.trim() || "Etichetta"}</span></div>
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
            setToggleDesiredActive(!label.active);
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
    <section className="labels-page">
      <UnsavedChanges
        dirty={Boolean(
          newName || newColor !== "gray" ||
          (editing && (name !== editing.name || color !== editing.color)),
        )}
      />
      <header className="admin-heading labels-heading">
        <div>
          <h1 tabIndex={-1}>Etichette</h1>
          <p className="muted">Organizza le issue con termini condivisi.</p>

        </div>

      </header>
      {success && <Alert variant="success">{success}</Alert>}
      <form
        id="label-create-disclosure"
        className="label-create-disclosure"
        onSubmit={(event) => void create(event)}
        noValidate
      >
        <div className="label-create-heading"><h2>Nuova etichetta</h2></div>
        <ErrorAlert error={newError} focus />
        {newField && !newError && (
          <Alert focus focusKey={newField}>
            <a href="#new-label-name">{newField}</a>
          </Alert>
        )}
        <div className="label-create-fields">
          <TextField
            id="new-label-name"
            label="Nome"
            aria-label="Nome nuova etichetta *"
            placeholder="Nome etichetta"
            required
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            error={newField}
          />
          <ColorField value={newColor} onChange={setNewColor} />
          <div className="actions">
            <Button type="submit" variant={editing ? "secondary" : "primary"} busy={busy}>
              Crea etichetta
            </Button>
            {(newName || newColor !== "gray") && <Button disabled={busy} onClick={() => setDiscardCreate(true)}>Annulla</Button>}
          </div>
        </div>
      <div className="label-live-preview"><span>Anteprima</span><span className={`badge badge-${newColor}`}>{newName.trim() || "Etichetta"}</span></div>
      </form>
      {filters.valid && <Filters
        query={filters.q}
        active={filters.active}
        apply={apply}
      />}
      {!filters.valid ? (
        <Alert>
          Filtri non validi.{" "}
          <Button onClick={() => setParams(new URLSearchParams())}>
            Ripristina vista
          </Button>
        </Alert>
      ) : (
        <>
          <ErrorAlert error={list.error} />
          {list.isPending ? (
            <LoadingState />
          ) : (
            list.data && (
              <div aria-busy={list.isFetching}>

                {list.data.items.length === 0 ? (
                  <p className="panel">
                    Nessuna etichetta corrisponde ai filtri. Usa Nuova etichetta
                    per aggiungerne una al catalogo.
                  </p>
                ) : (
                  <>
                      <div className="admin-register admin-table-wrap labels-list">
                        <table className="admin-table admin-labels-table">
                          <caption className="visually-hidden">Catalogo etichette</caption>
                          <thead>
                            <tr>
                              <th scope="col">Etichetta</th>
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
                                  <td>
                                    <span className="muted">{label.active ? "Attiva" : "Inattiva"}</span>
                                  </td>
                                  <td>{actions(label)}</td>
                                </tr>
                                {editing?.id === label.id && (
                                  <tr>
                                    <td colSpan={3}>{editor}</td>
                                  </tr>
                                )}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>

                  </>
                )}
                {editing &&
                  !list.data.items.some((label) => label.id === editing.id) &&
                  editor}
                <p className="admin-results-status" role="status">
                  {list.isFetching ? "Aggiornamento in corso. " : ""}
                  {list.data.totalElements} etichette
                  {list.isPlaceholderData &&
                    " · risultati dei filtri precedenti"}
                </p>
                {list.data.totalPages > 1 && <Pagination
                  page={list.data.page}
                  size={list.data.size}
                  totalElements={list.data.totalElements}
                  totalPages={list.data.totalPages}
                  onPageChange={(page) => paginate(page)}
                  onSizeChange={(size) => paginate(0, size)}
                />}
              </div>
            )
          )}
        </>
      )}
      <Dialog
        className="admin-compact-dialog"
        open={Boolean(toggle)}
        title={toggleDesiredActive ? "Riattiva etichetta" : "Disattiva etichetta"}
        sensitive
        busy={busy}
        onClose={() => setToggle(null)}
        footer={
          <>
            <Button data-cancel disabled={busy} onClick={() => setToggle(null)}>
              Annulla
            </Button>
            <Button
              variant={toggleDesiredActive ? "primary" : "danger"}
              busy={busy}
              onClick={() =>
                toggle && void update(toggle, toggleDesiredActive, true)
              }
            >
              {toggleDesiredActive ? "Conferma riattivazione" : "Conferma disattivazione"}
            </Button>
          </>
        }
      >
        <ErrorAlert error={error} />
        <p>
          {!toggleDesiredActive
            ? `Le associazioni di ${toggle?.name} già presenti restano. L'etichetta non sarà disponibile per nuove associazioni.`
            : `${toggle?.name} tornerà disponibile per le nuove associazioni.`}
        </p>
      </Dialog>
      <Dialog
        className="admin-conflict-dialog"
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
            <dl className="label-conflict-values">
              <div><dt>La tua bozza</dt><dd>{conflictIsToggle ? conflictTarget?.name : name}, {colors[conflictIsToggle ? (conflictTarget?.color ?? color) : color]}, {(conflictIsToggle ? toggleDesiredActive : editing?.active) ? "attiva" : "inattiva"}.</dd></div>
              <div><dt>Valore attuale</dt><dd>{latest.name}, {colors[latest.color]}, {latest.active ? "attiva" : "inattiva"}.</dd></div>
            </dl>
            <p>
              Dati correnti: {latest.name}, {colors[latest.color]},{" "}
              {latest.active ? "attiva" : "inattiva"}.
            </p>
            <Button
              onClick={() => {
                if (conflictIsToggle) setToggle(latest);
                else setEditing(latest);
                setConflict(false);
                setError(null);
              }}
            >
              Mantieni la bozza e usa la versione corrente
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                edit(latest);
                setConflict(false);
              }}
            >
              Scarta la bozza e carica i dati correnti
            </Button>
          </>
        ) : (
          <Button onClick={() => conflictTarget && void refreshConflict(conflictTarget)}>
            Riprova caricamento
          </Button>
        )}
        <Button data-cancel onClick={() => setConflict(false)}>
          Torna alla bozza
        </Button>
      </Dialog>
      <Dialog
        className="admin-compact-dialog"
        open={discardCreate}
        title="Lasciare la bozza?"
        sensitive
        onClose={() => setDiscardCreate(false)}
        footer={<>
          <Button data-cancel onClick={() => setDiscardCreate(false)}>Continua a scrivere</Button>
          <Button variant="danger" onClick={() => {
            setNewName("");
            setNewColor("gray");
            setNewError(null);
            setNewField(undefined);
            setDiscardCreate(false);
          }}>Scarta bozza</Button>
        </>}
      ><p>Il nome dell'etichetta non è stato salvato. Scartare la bozza?</p></Dialog>
    </section>
  );
}
