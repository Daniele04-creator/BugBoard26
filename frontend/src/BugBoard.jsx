import React, { useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import IssueCreate from './pages/IssueCreate.jsx';
import IssueList from './pages/IssueList.jsx';
import IssueManage from './pages/IssueManage.jsx';

export default function BugBoard() {
  const [currentView, setCurrentView] = useState('none');

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

  // DATI
  const [issues, setIssues] = useState([
    { id: 142, title: 'Errore validazione login', type: 'Bug', priority: 'Alta', status: 'TODO',  assignee: 'luca',  date: '17/05/2004' },
    { id: 121, title: 'Pulsante "salva" invisibile', type: 'Bug', priority: 'Media', status: 'DOING', assignee: 'sara',  date: '18/05/2004' },
    { id: 98,  title: 'Migliora tooltip icone',     type: 'Feature', priority: 'Bassa', status: 'DONE',  assignee: 'luca',  date: '19/05/2004' },
    { id: 87,  title: 'Documentazione API mancante', type: 'Documentation', priority: 'Media', status: 'TODO', assignee: 'marco', date: '20/05/2004' },
    { id: 65,  title: 'Come configurare il database?', type: 'Question', priority: 'Bassa', status: 'DONE', assignee: 'anna',  date: '21/05/2004' },
  ]);

  // UTENTE CORRENTE (per ora mock, poi verrà dal login)
  const currentUser = 'luca';
  const isAdmin = true;
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
    switch (sortBy) {
      case 'Data':
        return (
          new Date(b.date.split('/').reverse().join('-')) -
          new Date(a.date.split('/').reverse().join('-'))
        );
      case 'Titolo':
        return a.title.localeCompare(b.title);
      case 'Priorità': {
        const priorityOrder = { Alta: 3, Media: 2, Bassa: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      case 'Stato': {
        const statusOrder = { TODO: 1, DOING: 2, DONE: 3 };
        return statusOrder[a.status] - statusOrder[b.status];
      }
      default:
        return 0;
    }
  });

  // AZIONI
  const handleCreate = () => {
    const newErrors = {
      title: !title.trim(),
      description: !description.trim(),
    };
    setErrors(newErrors);

    if (!newErrors.title && !newErrors.description) {
      const newIssue = {
        id: Math.floor(Math.random() * 10000),
        title,
        type: selectedType || 'Bug',
        priority: selectedPriority || 'Bassa',
        status: 'TODO',
        assignee: currentUser,
        date: new Date().toLocaleDateString('it-IT'),
      };

      setIssues([newIssue, ...issues]);
      setTitle('');
      setDescription('');
      setSelectedType(null);
      setSelectedPriority(null);
      alert('Issue creata con successo!');
      setCurrentView('list');
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

  return (
    <div
      className="flex h-screen"
      style={{ background: 'linear-gradient(90deg, #7DD3FC 0%, #A78BFA 100%)' }}
    >
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />

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
          filterType={filterType}
          setFilterType={setFilterType}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          filterPriority={filterPriority}
          setFilterPriority={setFilterPriority}
          sortBy={sortBy}
          setSortBy={setSortBy}
          issues={sortedIssues}
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
        />
      )}
    </div>
  );
}
