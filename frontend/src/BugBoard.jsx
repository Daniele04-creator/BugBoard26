import React, { useState } from 'react';
import { LogOut } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import IssueCreate from './pages/IssueCreate.jsx';
import IssueList from './pages/IssueList.jsx';
import IssueManage from './pages/IssueManage.jsx';
import IssuePreview from './pages/IssuePreview.jsx';
import UserAdmin from './pages/UserAdmin.jsx';

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

  // DATI
  const [issues, setIssues] = useState([
    { id: 142, title: 'Errore validazione login', type: 'Bug', priority: 'Alta', status: 'TODO',  assignee: 'luca',  date: '17/05/2004' },
    { id: 121, title: 'Pulsante "salva" invisibile', type: 'Bug', priority: 'Media', status: 'DOING', assignee: 'sara',  date: '18/05/2004' },
    { id: 98,  title: 'Migliora tooltip icone',     type: 'Feature', priority: 'Bassa', status: 'DONE',  assignee: 'luca',  date: '19/05/2004' },
    { id: 87,  title: 'Documentazione API mancante', type: 'Documentation', priority: 'Media', status: 'TODO', assignee: 'marco', date: '20/05/2004' },
    { id: 65,  title: 'Come configurare il database?', type: 'Question', priority: 'Bassa', status: 'DONE', assignee: 'anna',  date: '21/05/2004' },
  ]);

  // UTENTE CORRENTE - viene dal login
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

  // FILTRI + ORDINAMENTO
  const filteredIssues = issues.filter(issue => {
    const matchType = filterType === 'Tutti' || issue.type === filterType;
    const matchStatus = filterStatus === 'Tutti' || issue.status === filterStatus;
    const matchPriority = filterPriority === 'Tutti' || issue.priority === filterPriority;
    return matchType && matchStatus && matchPriority;
  });

  const sortedIssues = [...filteredIssues].sort((a, b) => {
    let result = 0;
    switch (sortBy) {
      case 'Data':
        result =
          new Date(b.date.split('/').reverse().join('-')) -
          new Date(a.date.split('/').reverse().join('-'));
        break;
      case 'Titolo':
        result = a.title.localeCompare(b.title);
        break;
      case 'Priorità': {
        const priorityOrder = { Alta: 3, Media: 2, Bassa: 1 };
        result = priorityOrder[b.priority] - priorityOrder[a.priority];
        break;
      }
      case 'Stato': {
        const statusOrder = { TODO: 1, DOING: 2, DONE: 3 };
        result = statusOrder[a.status] - statusOrder[b.status];
        break;
      }
      default:
        result = 0;
    }
    return sortOrder === 'asc' ? result : -result;
  });

const handleCreate = async (issuePayload) => {
  try {
    const response = await fetch("http://localhost:8080/api/issues", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: issuePayload.title,
        description: issuePayload.description,
        type: issuePayload.type,
        priority: issuePayload.priority,
        assignee: currentUser?.email,
        image: issuePayload.image || null,
      }),
    });

    if (!response.ok) {
      alert("Errore durante la creazione dell'issue");
      return;
    }

    const savedIssue = await response.json();
    console.log("Issue salvata dal backend:", savedIssue);

    // qui in futuro aggiorneremo la lista locale
    setCurrentView("list");
  } catch (err) {
    console.error("Errore di rete durante la creazione issue:", err);
    alert("Errore di connessione al server");
  }
};


  const handleDelete = (id) => {
    if (window.confirm('Sei sicuro di voler eliminare questa issue?')) {
      setIssues(issues.filter((i) => i.id !== id));
    }
  };

  const handleUpdate = () => {
    setIssues(issues.map((i) => (i.id === editingItem.id ? editingItem : i)));
    setEditingItem(null);
  };

  const handleCreateUser = (userData) => {
    // Mock: in futuro sarà una chiamata API al backend
    console.log('Nuovo utente creato:', userData);
    alert(`Utente ${userData.email} creato con successo!`);
    setShowUserAdminModal(false);
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
        <IssueList 
          onSelectIssue={setSelectedIssuePreview}
        />
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
