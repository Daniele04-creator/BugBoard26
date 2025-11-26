import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export default function IssueList({
  filterType,
  setFilterType,
  filterStatus,
  setFilterStatus,
  filterPriority,
  setFilterPriority,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  issues,
  onLogout,
}) {
  const handleReset = () => {
    setFilterType('Tutti');
    setFilterStatus('Tutti');
    setFilterPriority('Tutti');
    setSortBy('Data');
    setSortOrder('asc');
  };

  return (
    <div className="flex-1 p-8 flex items-center justify-center overflow-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl p-8">
        <h2 className="text-3xl font-bold mb-8">Elenco Issue</h2>
        {/* Filtri */}
        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <span className="text-lg font-semibold italic">Filtri:</span>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Tipo:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none"
            >
              <option>Tutti</option>
              <option>Question</option>
              <option>Bug</option>
              <option>Documentation</option>
              <option>Feature</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Stato:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none"
            >
              <option>Tutti</option>
              <option>TODO</option>
              <option>DOING</option>
              <option>DONE</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Priorità:</span>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none"
            >
              <option>Tutti</option>
              <option>Bassa</option>
              <option>Media</option>
              <option>Alta</option>
            </select>
          </div>

          <div className="ml-auto">
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-gradient-to-r from-purple-400 to-cyan-400 text-white rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all"
              title="Reset filtri"
            >
              Reset filtri
            </button>
          </div>
        </div>

        {/* Ordinamento */}
        <div className="mb-6 flex items-center gap-4">
          <span className="text-lg font-semibold italic">Ordina per:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none"
          >
            <option>Data</option>
            <option>Titolo</option>
            <option>Priorità</option>
            <option>Stato</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="p-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-all"
            title={sortOrder === 'asc' ? 'Ordine crescente (clicca per decrescente)' : 'Ordine decrescente (clicca per crescente)'}
          >
            {sortOrder === 'asc' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {/* Tabella */}
        <div className="bg-gray-100 rounded-2xl p-6 min-h-96">
          <table className="w-full text-left">
            <thead>
              <tr className="text-gray-500 italic border-b border-gray-300">
                <th className="pb-3 font-medium">Titolo</th>
                <th className="pb-3 font-medium">Tipo</th>
                <th className="pb-3 font-medium">Priorità</th>
                <th className="pb-3 font-medium">Stato</th>
                <th className="pb-3 font-medium">Assegnatario</th>
                <th className="pb-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr
                  key={issue.id}
                  className="text-gray-600 border-b border-gray-300"
                >
                  <td className="py-3">{issue.title}</td>
                  <td className="py-3">{issue.type}</td>
                  <td className="py-3">{issue.priority}</td>
                  <td className="py-3">{issue.status}</td>
                  <td className="py-3">{issue.assignee}</td>
                  <td className="py-3">{issue.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
