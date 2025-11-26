import React from 'react';

export default function IssueList({
  filterType,
  setFilterType,
  filterStatus,
  setFilterStatus,
  filterPriority,
  setFilterPriority,
  sortBy,
  setSortBy,
  issues,
  onLogout,
}) {
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
