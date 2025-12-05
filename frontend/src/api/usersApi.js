// src/api/usersApi.js
import { API_BASE_URL } from "../config/api";

// Lista utenti (solo per ADMIN)
export async function fetchUsersAsAdmin(currentUser) {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users`, {
    headers: {
      "X-User-Email": currentUser.email,
      "X-User-Role": currentUser.role,
    },
  });

  if (resp.status === 403) {
    const err = new Error("FORBIDDEN");
    err.code = "FORBIDDEN";
    throw err;
  }

  if (!resp.ok) {
    const err = new Error("GENERIC_ERROR");
    err.code = "GENERIC_ERROR";
    throw err;
  }

  return resp.json();
}

// Creazione utente (ADMIN)
export async function createUserAsAdmin(currentUser, newUser) {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Email": currentUser.email,
      "X-User-Role": currentUser.role,
    },
    body: JSON.stringify(newUser),
  });

  if (resp.status === 403) {
    const err = new Error("FORBIDDEN");
    err.code = "FORBIDDEN";
    throw err;
  }

  if (resp.status === 400) {
    const msg = await resp.text();
    const err = new Error(msg || "BAD_REQUEST");
    err.code = "BAD_REQUEST";
    err.serverMessage = msg;
    throw err;
  }

  if (!resp.ok) {
    const err = new Error("GENERIC_ERROR");
    err.code = "GENERIC_ERROR";
    throw err;
  }

  return resp.json(); // opzionale, se il backend restituisce l'utente creato
}

// Eliminazione utente (ADMIN)
export async function deleteUserAsAdmin(currentUser, userId) {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      "X-User-Email": currentUser.email,
      "X-User-Role": currentUser.role,
    },
  });

  if (resp.status === 403) {
    const err = new Error("FORBIDDEN");
    err.code = "FORBIDDEN";
    throw err;
  }

  if (resp.status === 400) {
    const msg = await resp.text();
    const err = new Error(msg || "BAD_REQUEST");
    err.code = "BAD_REQUEST";
    err.serverMessage = msg;
    throw err;
  }

  if (!resp.ok) {
    const err = new Error("GENERIC_ERROR");
    err.code = "GENERIC_ERROR";
    throw err;
  }

  return true;
}
