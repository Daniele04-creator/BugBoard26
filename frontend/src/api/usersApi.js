import { API_BASE_URL } from "../config/api";

async function parseBody(resp) {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildError(code, serverMessage) {
  const err = new Error(code);
  err.code = code;
  if (serverMessage) err.serverMessage = serverMessage;
  return err;
}

function authHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return token ? { Authorization: token, ...extra } : { ...extra };
}

export async function fetchUsersAsAdmin() {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users`, {
    headers: authHeaders(),
  });

  if (resp.status === 403) throw buildError("FORBIDDEN");

  if (!resp.ok) {
    const body = await parseBody(resp);
    throw buildError("GENERIC_ERROR", typeof body === "string" ? body : null);
  }

  const body = await parseBody(resp);
  return Array.isArray(body) ? body : [];
}

export async function createUserAsAdmin(newUser) {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(newUser),
  });

  if (resp.status === 403) throw buildError("FORBIDDEN");
  if (resp.status === 409) throw buildError("USER_ALREADY_EXISTS");

  const body = await parseBody(resp);

  if (resp.status === 400) {
    throw buildError("BAD_REQUEST", typeof body === "string" ? body : null);
  }

  if (!resp.ok) {
    throw buildError("GENERIC_ERROR", typeof body === "string" ? body : null);
  }

  return body;
}

export async function updateUserAsAdmin(userId, payload) {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  if (resp.status === 403) throw buildError("FORBIDDEN");
  if (resp.status === 409) throw buildError("USER_ALREADY_EXISTS");

  const body = await parseBody(resp);

  if (resp.status === 400) {
    throw buildError("BAD_REQUEST", typeof body === "string" ? body : null);
  }

  if (!resp.ok) {
    throw buildError("GENERIC_ERROR", typeof body === "string" ? body : null);
  }

  return body;
}

export async function deleteUserAsAdmin(userId) {
  const resp = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (resp.status === 403) throw buildError("FORBIDDEN");

  const body = await parseBody(resp);

  if (resp.status === 400) {
    throw buildError("BAD_REQUEST", typeof body === "string" ? body : null);
  }

  if (!resp.ok) {
    throw buildError("GENERIC_ERROR", typeof body === "string" ? body : null);
  }

  return true;
}
