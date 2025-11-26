import React from 'react';
import { Plus, FileText, Edit, LogOut } from 'lucide-react';

export default function Sidebar({ currentView, setCurrentView, onLogout }) {
  const getTitle = () => {
    if (currentView === 'new') return 'Nuova Issue';
    if (currentView === 'list') return 'Elenco Issue';
    if (currentView === 'manage') return 'Gestione';
    return 'Seleziona opzione';
  };

  return (
    <div className="w-80 p-6 flex flex-col">
      <div className="mb-6">
        <button
          onClick={onLogout}
          className="p-3 bg-gradient-to-r from-red-400 to-orange-400 text-white rounded-full hover:shadow-lg transition-all border-4 border-white"
          title="Logout"
        >
          <LogOut size={20} />
        </button>
      </div>
      <div className="flex-1 flex flex-col justify-center">
        <div className="bg-white rounded-3xl p-6 shadow-lg flex flex-col gap-6">
        <h1
          className={`text-2xl font-bold text-center mb-2 ${
            currentView !== 'none'
              ? 'bg-gradient-to-r from-teal-500 to-green-400 bg-clip-text text-transparent'
              : 'text-black'
          }`}
        >
          {getTitle()}
        </h1>

        <button
          onClick={() => setCurrentView('new')}
          className="w-full bg-gradient-to-r from-teal-500 to-green-400 text-white rounded-2xl py-4 px-6 flex items-center gap-3 font-semibold shadow-lg hover:shadow-xl transition-all"
        >
          <Plus size={24} />
          Nuova Issue
        </button>

        <button
          onClick={() => setCurrentView('list')}
          className="w-full bg-gradient-to-r from-teal-500 to-green-400 text-white rounded-2xl py-4 px-6 flex items-center gap-3 font-semibold shadow-lg hover:shadow-xl transition-all"
        >
          <FileText size={24} />
          Elenco Issue
        </button>

        <button
          onClick={() => setCurrentView('manage')}
          className="w-full bg-gradient-to-r from-red-400 to-orange-400 text-white rounded-2xl py-4 px-6 flex items-center gap-3 font-semibold shadow-lg hover:shadow-xl transition-all"
        >
          <Edit size={24} />
          Gestisci Issue
        </button>
      </div>
      </div>
    </div>
  );
}
