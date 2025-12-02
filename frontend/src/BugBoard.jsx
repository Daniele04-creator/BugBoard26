import React, { useState, useEffect } from 'react';
import { LogOut } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import IssueCreate from './pages/IssueCreate.jsx';
import IssueList from './pages/IssueList.jsx';
import IssueManage from './pages/IssueManage.jsx';
import IssuePreview from './pages/IssuePreview.jsx';
import UserAdmin from './pages/UserAdmin.jsx';

// 👇 Base URL delle API: prima prova a leggere VITE_API_BASE_URL, se non c'è usa localhost
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8080";

export default function BugBoard({ onLogout, currentUser, onImpersonate }) {
  const [currentView, setCurrentView] = useState('none');
  const [showUserAdminModal, setShowUserAdminModal] = useState(false);
  const [selectedIssuePreview, setSelectedIssuePreview] = useState(null);

  // STATO CREAZIONE
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedType, setSelectedType] = useState(null);
  const [selectedPriority, setSelectedPriority] = useState(null);
  const [errors, setErrors] = useState({ title: false, description: false });

  // STATO FILTRI
  const [filterType, setFilterType] = useState('Tutti');
  const [filterStatus, setFilterStatus] = useState('Tutti');
  const [filterPriority, setFilterPriority] = useState('Tutti');
  const [sortBy, setSortBy] = useState('Data');
  const [sortOrder, setSortOrder] = useState('asc');

  const [issues, setIssues] = useState([]);

  const isAdmin = currentUser?.role === 'ADMIN';
  const [editingItem, setEditingItem] = useState(null);

  const types = ['Question', 'Bug', 'Documentation', 'Feature'];
  const priorities = ['Bassa', 'Media', 'Alta'];
  const statuses = ['TODO', 'DOING', 'DONE'];

  const getPriorityGradient = (priority) => {
    switch (priority) {
      case 'Bassa': return 'from-blue-400 to-cyan-400';
      case 'Media': return 'from-yellow-400 to-orange-400';
      case 'Alta':  return 'from-red-400 to-pink-500';
      default:      return 'from-gray-300 to-gray-400';
    }
  };

  useEffect(() => {
    const loadIssues = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/issues`);
        if (!response.ok) {
          console.error("Errore HTTP caricamento issue:", response.status);
          return;
        }
        const data = await response.json();
        setIssues(data);
      } catch (err) {
        console.error('Errore caricamento issue:', err);
      }
    };
    loadIssues();
  }, []);

  const filteredIssues = issues.filter(issue => {
    const matchType = filterType === 'Tutti' || issue.type === filterType;
    const matchStatus = filterStatus === 'Tutti' || issue.status === filterStatus;
    const matchPriority = filterPriority === 'Tutti' || issue.priority === filterPriority;
    return matchType && matchStatus && matchPriority;
  });

  const sortedIssues = [...filteredIssues].sort((a, b) => {
    let result = 0;
    switch (sortBy) {
      case 'Data': {
        const da = new Date(a.createdAt || 0);
        const db = new Date(b.createdAt || 0);
        result = db - da;
        break;
      }
      case 'Titolo':
        result = a.title.localeCompare(b.title);
        break;
      case 'Priorità': {
        const priorityOrder = { Alta: 3, Media: 2, Bassa: 1 };
        result = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        break;
      }
      case 'Stato': {
        const statusOrder = { TODO: 1, DOING: 2, DONE: 3 };
        result = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
        break;
      }
      default:
        result = 0;
    }
    return sortOrder === 'asc' ? result : -result;
  });

  const handleCreate = async (issuePayload) => {
    try {
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
        alert("Errore durante la creazione dell'issue");
        return;
      }

      const savedIssue = await response.json();
      setIssues(prev => [savedIssue, ...prev]);
      setCurrentView("list");
    } catch (err) {
      console.error("Errore di rete durante la creazione issue:", err);
      alert("Errore di connessione al server");
    }
  };

  const handleDelete = async (issueId) => {
    if (!window.confirm("Sei sicuro di voler eliminare questa issue?")) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/issues/${issueId}`, {
        method: "DELETE",
        headers: {
          "X-User-Email": currentUser.email,
          "X-User-Role": currentUser.role,
        },
      });

      if (response.status === 403) {
        alert("Non hai i permessi per eliminare questa issue");
        return;
      }

      if (!response.ok && response.status !== 204) {
        alert("Errore durante l'eliminazione");
        return;
      }

      setIssues(prev => prev.filter(i => i.id !== issueId));
    } catch (err) {
      console.error("Errore di rete:", err);
      alert("Errore di connessione al server");
    }
  };

  const handleUpdate = async () => {
    if (!editingItem) return;

    try {
      const response = await fetch(`${API_BASE_URL}/api/issues/${editingItem.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-User-Email": currentUser.email,
          "X-User-Role": currentUser.role,
        },
        body: JSON.stringify({
          title: editingItem.title,
          status: editingItem.status,
          priority: editingItem.priority,
          image: editingItem.image || null,
        }),
      });

      if (response.status === 403) {
        alert("Non hai i permessi per modificare questa issue");
        return;
      }

      if (!response.ok) {
        alert("Errore durante l'aggiornamento");
        return;
      }

      const updated = await response.json();
      setEditingItem(null);
      setIssues(prev => prev.map(i => (i.id === updated.id ? updated : i)));
    } catch (err) {
      console.error("Errore di rete:", err);
      alert("Errore di connessione al server");
    }
  };

  const handleCreateUser = async (userData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
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
      style={{ background: 'linear-gradient(90deg, #7DD3FC 0%, #A78BFA 100%)' }}
    >
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        onLogout={onLogout}
        isAdmin={isAdmin}
        onOpenUserAdmin={() => setShowUserAdminModal(true)}
      />

      {/* CONTENUTO PRINCIPALE */}

      {currentView === 'none' && (
        <div className="flex flex-col items-center justify-center w-full text-center px-10">
          <h1 className="text-5xl font-extrabold text-white drop-shadow-lg mb-4">
            BugBoard26
          </h1>

          <p className="text-xl italic text-white/90 max-w-3xl leading-relaxed mb-4">
            BugBoard26 è una piattaforma professionale dedicata alla gestione completa delle issue.
            Permette a team e aziende di creare, organizzare, monitorare e risolvere problemi in modo
            semplice ed efficiente.
          </p>

          <p className="text-2xl italic text-white font-semibold mt-4">
            "Il tuo lavoro, semplificato."
          </p>
        </div>
      )}

      {currentView === 'new' && (
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
          onCreate={handleCreate}
          onCancel={() => setCurrentView('none')}
        />
      )}

      {currentView === 'list' && (
        <IssueList onSelectIssue={setSelectedIssuePreview} />
      )}

      {currentView === 'manage' && (
        <IssueManage
          issues={sortedIssues}
          priorities={priorities}
          statuses={statuses}
          getPriorityGradient={getPriorityGradient}
          editingItem={editingItem}
          setEditingItem={setEditingItem}
          handleDelete={handleDelete}
          handleUpdate={handleUpdate}
          currentUser={currentUser}
          isAdmin={isAdmin}
          onLogout={onLogout}
          onImpersonate={onImpersonate}
        />
      )}

      {showUserAdminModal && (
        <UserAdmin
          onClose={() => setShowUserAdminModal(false)}
          onCreateUser={handleCreateUser}
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
