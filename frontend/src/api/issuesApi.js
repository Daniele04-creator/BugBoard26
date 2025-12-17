import { API_BASE_URL } from "../config/api";

function authHeaders(extra = {}) {
  const token = localStorage.getItem("token");
  return token ? { Authorization: token, ...extra } : { ...extra };
}

export async function fetchIssues() {
  const response = await fetch(`${API_BASE_URL}/api/issues`, {
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Errore caricamento issue: ${response.status}`);
  }

  return response.json();
}

export async function createIssue(issuePayload) {
  const cleanType =
    issuePayload.type === "-" || !issuePayload.type ? null : issuePayload.type;

  const cleanPriority =
    issuePayload.priority === "-" || !issuePayload.priority
      ? null
      : issuePayload.priority;

  const cleanAssigneeId =
    issuePayload.assigneeId !== undefined && issuePayload.assigneeId !== null
      ? Number(issuePayload.assigneeId)
      : null;

  const response = await fetch(`${API_BASE_URL}/api/issues`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      title: issuePayload.title,
      description: issuePayload.description,
      type: cleanType,
      priority: cleanPriority,
      assigneeId: cleanAssigneeId,
      image: issuePayload.image || null,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Errore durante la creazione dell'issue");
  }

  return response.json();
}

export async function deleteIssue(issueId) {
  const response = await fetch(`${API_BASE_URL}/api/issues/${issueId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (response.status === 403) {
    throw new Error("Non hai i permessi per eliminare questa issue");
  }

  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Errore durante l'eliminazione");
  }

  return true;
}

export async function updateIssue(issue) {
  const response = await fetch(`${API_BASE_URL}/api/issues/${issue.id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      title: issue.title,
      status: issue.status,
      priority: issue.priority,
      image: issue.image || null,
    }),
  });

  if (response.status === 403) {
    throw new Error("Non hai i permessi per modificare questa issue");
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Errore durante l'aggiornamento");
  }

  return response.json();
}
