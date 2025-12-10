// src/features/issues/hooks/useIssues.js

import { useEffect, useState } from "react";
import {
  fetchIssues,
  createIssue,
  deleteIssue,
  updateIssue,
} from "../../../api/issuesApi.js";

export function useIssues(currentUser) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);

  // carica all’avvio
  useEffect(() => {
    loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadIssues = async () => {
    setLoading(true);
    try {
      const data = await fetchIssues();
      setIssues(data);
    } catch (err) {
      console.error("Errore caricamento issue:", err);
      alert("Errore durante il caricamento delle issue");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (issuePayload) => {
    const savedIssue = await createIssue(issuePayload, currentUser);
    setIssues((prev) => [savedIssue, ...prev]);
  };

  const handleDelete = async (issueId) => {
    await deleteIssue(issueId, currentUser);
    setIssues((prev) => prev.filter((i) => i.id !== issueId));
  };

  const handleUpdate = async (issue) => {
    const updated = await updateIssue(issue, currentUser);
    setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  return {
    issues,
    loading,
    reloadIssues: loadIssues,
    handleCreate,
    handleDelete,
    handleUpdate,
  };
}
