import { API_BASE_URL } from "../config/api";

// Carica tutte le issue
export async function fetchIssues() {
  const response = await fetch(`${API_BASE_URL}/api/issues`);
  if (!response.ok) {
    throw new Error(`Errore caricamento issue: ${response.status}`);
  }
  return response.json();
}

// Crea una nuova issue
export async function createIssue(issuePayload, currentUser) {
  const response = await fetch(`${API_BASE_URL}/api/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: issuePayload.title,
      description: issuePayload.description,
      type: issuePayload.type,
      priority: issuePayload.priority,
      assignee: currentUser?.email || "admin@bugboard.com",
      image: issuePayload.image || null,
    }),
  });

  if (!response.ok) {
    throw new Error("Errore durante la creazione dell'issue");
  }

  return response.json();
}

// Elimina una issue
export async function deleteIssue(issueId, currentUser) {
  const response = await fetch(`${API_BASE_URL}/api/issues/${issueId}`, {
    method: "DELETE",
    headers: {
      "X-User-Email": currentUser.email,
      "X-User-Role": currentUser.role,
    },
  });

  if (response.status === 403) {
    throw new Error("Non hai i permessi per eliminare questa issue");
  }

  if (!response.ok && response.status !== 204) {
    throw new Error("Errore durante l'eliminazione");
  }

  return true;
}

// Aggiorna una issue
export async function updateIssue(issue, currentUser) {
  const response = await fetch(`${API_BASE_URL}/api/issues/${issue.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-User-Email": currentUser.email,
      "X-User-Role": currentUser.role,
    },
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
    throw new Error("Errore durante l'aggiornamento");
  }

  return response.json();
}