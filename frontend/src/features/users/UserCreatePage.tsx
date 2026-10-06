import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { userApi } from "./userApi";
import {
  fieldErrors,
  normalizedName,
  passwordError,
  roleDescriptions,
  roleNames,
} from "./adminPresentation";
import type { UserRole } from "../../api/types";
import { Alert, ErrorAlert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { SelectField } from "../../components/SelectField";
import { PasswordField } from "../auth/PasswordField";
import { UnsavedChanges } from "../issues/UnsavedChanges";
import "./admin.css";

export function UserCreatePage() {
  const cache = useQueryClient();
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState<UserRole>("MEMBER");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [fields, setFields] = useState<Record<string, string>>({}),
    [created, setCreated] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const validation: Record<string, string> = {};
    const nameError = normalizedName(name, 2, 80),
      pwdError = passwordError(password);
    if (nameError) validation.displayName = nameError;
    if (
      !/^[\x21-\x7E]+@[a-zA-Z0-9.-]+\.[a-zA-Z0-9-]+$/.test(email.trim()) ||
      email.trim().length > 254
    )
      validation.email =
        "Inserisci un indirizzo email ASCII valido, fino a 254 caratteri.";
    if (pwdError) validation.password = pwdError;
    setFields(validation);
    setError(null);
    if (Object.keys(validation).length) return;
    setBusy(true);
    try {
      const user = await userApi.create({
        displayName: name.normalize("NFC").trim(),
        email: email.trim().toLowerCase(),
        password,
        role,
      });
      setPassword("");
      await cache.invalidateQueries({ queryKey: ["admin-users"] });
      await cache.invalidateQueries({ queryKey: ["users", "directory"] });
      await cache.invalidateQueries({ queryKey: ["reporting"] });
      setCreated(user.id);
    } catch (failure) {
      setError(failure);
      const errors = fieldErrors(failure);
      if (
        failure instanceof Error &&
        "code" in failure &&
        failure.code === "EMAIL_ALREADY_EXISTS"
      )
        errors.email = "Questa email è già associata a un account.";
      setFields(errors);
    } finally {
      setBusy(false);
    }
  }
  if (created)
    return (
      <Navigate
        to={`/admin/users/${created}/edit`}
        replace
        state={{ created: true }}
      />
    );
  return (
    <section className="admin-form">
      <Link to="/admin/users">Torna agli utenti</Link>
      <h1 tabIndex={-1}>Nuovo utente</h1>
      <p>
        * Campo obbligatorio. Il primo accesso richiederà il cambio della
        password temporanea.
      </p>
      <UnsavedChanges
        dirty={Boolean(name || email || password || role !== "MEMBER")}
      />
      <form className="panel" onSubmit={submit} noValidate>
        {Object.keys(fields).length > 0 && (
          <Alert focus focusKey={fields}>
            <strong>Controlla i campi indicati.</strong>
            <ul>
              {Object.entries(fields).map(([field, message]) => (
                <li key={field}>
                  <a href={`#new-user-${field}`}>{message}</a>
                </li>
              ))}
            </ul>
          </Alert>
        )}
        <ErrorAlert error={error} />
        <fieldset disabled={busy}>
          <TextField
            id="new-user-displayName"
            label="Nome"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fields.displayName}
            hint="Da 2 a 80 caratteri."
          />
          <TextField
            id="new-user-email"
            label="Email"
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fields.email}
          />
          <SelectField
            id="new-user-role"
            label="Ruolo"
            required
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
            hint={roleDescriptions[role]}
          >
            {Object.entries(roleNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <PasswordField
            id="new-user-password"
            label="Password temporanea"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fields.password}
            hint="12–128 caratteri. La password non viene troncata."
          />
          <div className="actions">
            <Button type="submit" variant="primary" busy={busy}>
              Crea utente
            </Button>
            <Link className="button" to="/admin/users">
              Annulla
            </Link>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
