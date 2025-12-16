import React, { useState } from "react";
import Sidebar from "../../../layout/Sidebar.jsx";
import IssueCreate from "../components/IssueCreate.jsx";
import IssueList from "../components/IssueList.jsx";
import IssueManage from "../components/IssueManage.jsx";
import IssuePreview from "../components/IssuePreview.jsx";
import UserAdminScreen from "../../users/screens/UserAdminScreen.jsx";

import { useIssues } from "../hooks/useIssues.js";

export default function BugBoard({ onLogout, currentUser, onImpersonate }) {
  const [currentView, setCurrentView] = useState("none");
  const [showUserAdminModal, setShowUserAdminModal] = useState(false);
  const [selectedIssuePreview, setSelectedIssuePreview] = useState(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedType, setSelectedType] = useState(null);
  const [selectedPriority, setSelectedPriority] = useState(null);
  const [errors, setErrors] = useState({ title: false, description: false });

  const [filterType, setFilterType] = useState("Tutti");
  const [filterStatus, setFilterStatus] = useState("Tutti");
  const [filterPriority, setFilterPriority] = useState("Tutti");
  const [sortBy, setSortBy] = useState("Data");
  const [sortOrder, setSortOrder] = useState("asc");

  const [editingItem, setEditingItem] = useState(null);

  const { issues, loading, handleCreate, handleDelete, handleUpdate } =
    useIssues(currentUser);

  const isAdmin = currentUser?.role === "ADMIN";

  const types = ["Question", "Bug", "Documentation", "Feature"];
  const priorities = ["Bassa", "Media", "Alta"];
  const statuses = ["TODO", "DOING", "DONE"];

  const getPriorityGradient = (priority) => {
    switch (priority) {
      case "Bassa":
        return "from-blue-400 to-cyan-400";
      case "Media":
        return "from-yellow-400 to-orange-400";
      case "Alta":
        return "from-red-400 to-pink-500";
      default:
        return "from-gray-300 to-gray-400";
    }
  };

  const filteredIssues = issues.filter((issue) => {
    const matchType = filterType === "Tutti" || issue.type === filterType;
    const matchStatus = filterStatus === "Tutti" || issue.status === filterStatus;
    const matchPriority = filterPriority === "Tutti" || issue.priority === filterPriority;
    return matchType && matchStatus && matchPriority;
  });

  const sortedIssues = [...filteredIssues].sort((a, b) => {
    let result = 0;
    switch (sortBy) {
      case "Data": {
        const da = new Date(a.createdAt || 0);
        const db = new Date(b.createdAt || 0);
        result = db - da;
        break;
      }
      case "Titolo":
        result = a.title.localeCompare(b.title);
        break;
      case "Priorità": {
        const priorityOrder = { Alta: 3, Media: 2, Bassa: 1 };
        result = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        break;
      }
      case "Stato": {
        const statusOrder = { TODO: 1, DOING: 2, DONE: 3 };
        result = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
        break;
      }
      default:
        result = 0;
    }
    return sortOrder === "asc" ? result : -result;
  });

  const handleCreateWithAlerts = async (issuePayload) => {
    try {
      await handleCreate(issuePayload);
      setCurrentView("list");
    } catch (err) {
      console.error("Errore creazione issue:", err);
      alert(err.message || "Errore durante la creazione dell'issue");
    }
  };

  const handleDeleteWithAlerts = async (issueId) => {
    if (!window.confirm("Sei sicuro di voler eliminare questa issue?")) return;
    try {
      await handleDelete(issueId);
    } catch (err) {
      console.error("Errore eliminazione issue:", err);
      alert(err.message || "Errore durante l'eliminazione");
    }
  };

  const handleUpdateWithAlerts = async () => {
    if (!editingItem) return;
    try {
      await handleUpdate(editingItem);
      setEditingItem(null);
    } catch (err) {
      console.error("Errore aggiornamento issue:", err);
      alert(err.message || "Errore durante l'aggiornamento");
    }
  };

  const handleCreateUser = async (userData) => {
    try {
      const response = await fetch(`/api/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Email": currentUser.email,
          "X-User-Role": currentUser.role,
        },
        body: JSON.stringify({
          email: userData.email,
          password: userData.password,
          role: userData.role || "USER",
        }),
      });

      if (response.status === 403) {
        alert("Solo un ADMIN può creare nuovi utenti");
        return;
      }

      if (response.status === 409) {
        alert("Esiste già un utente con questa email");
        return;
      }

      if (!response.ok) {
        alert("Errore nella creazione utente");
        return;
      }

      alert(`Utente ${userData.email} creato con successo!`);
      setShowUserAdminModal(false);
    } catch (err) {
      console.error("Errore creazione utente:", err);
      alert("Errore di connessione al server");
    }
  };

  return (
    <div
      className="flex h-screen"
      style={{
        background: "linear-gradient(90deg, #7DD3FC 0%, #A78BFA 100%)",
      }}
    >
      <Sidebar
        currentView={currentView}
        setCurrentView={setCurrentView}
        onLogout={onLogout}
        isAdmin={isAdmin}
        onOpenUserAdmin={() => setShowUserAdminModal(true)}
      />

      {currentView === "none" && (
        <div className="flex flex-col items-center justify-center w-full text-center px-10">
          <h1 className="text-5xl font-extrabold text-white drop-shadow-lg mb-4">
            BugBoard26
          </h1>

          <p className="text-xl italic text-white/90 max-w-3xl leading-relaxed mb-4">
            BugBoard26 è una piattaforma professionale dedicata alla gestione
            completa delle issue. Permette a team e aziende di creare, organizzare,
            monitorare e risolvere problemi in modo semplice ed efficiente.
          </p>

          <p className="text-2xl italic text-white font-semibold mt-4">
            "Il tuo lavoro, semplificato."
          </p>
        </div>
      )}

      {currentView === "new" && (
        <IssueCreate
          title={title}
          description={description}
          selectedType={selectedType}
          selectedPriority={selectedPriority}
          errors={errors}
          setTitle={setTitle}
          setDescription={setDescription}
          setSelectedType={setSelectedType}
          setSelectedPriority={setSelectedPriority}
          setErrors={setErrors}
          types={types}
          priorities={priorities}
          getPriorityGradient={getPriorityGradient}
          onCreate={handleCreateWithAlerts}
          onCancel={() => setCurrentView("none")}
        />
      )}

      {currentView === "list" && (
        <IssueList
          issues={issues}
          loading={loading}
          onSelectIssue={setSelectedIssuePreview}
        />
      )}

      {currentView === "manage" && (
        <IssueManage
          issues={sortedIssues}
          priorities={priorities}
          statuses={statuses}
          getPriorityGradient={getPriorityGradient}
          editingItem={editingItem}
          setEditingItem={setEditingItem}
          handleDelete={handleDeleteWithAlerts}
          handleUpdate={handleUpdateWithAlerts}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onImpersonate={onImpersonate}
        />
      )}

      {showUserAdminModal && (
        <UserAdminScreen
          onClose={() => setShowUserAdminModal(false)}
          onCreateUser={handleCreateUser}
          currentUser={currentUser}
          onLogout={onLogout}
        />
      )}

      {selectedIssuePreview && (
        <IssuePreview
          issue={selectedIssuePreview}
          onClose={() => setSelectedIssuePreview(null)}
          getPriorityGradient={getPriorityGradient}
        />
      )}
    </div>
  );
}
