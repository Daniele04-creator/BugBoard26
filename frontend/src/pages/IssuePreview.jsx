import React from 'react';
import { X } from 'lucide-react';

export default function IssuePreview({ issue, onClose, getPriorityGradient }) {
  if (!issue) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-8 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-3xl font-bold text-gray-800">{issue.title}</h2>
          <button
            onClick={onClose}
            className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-all"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {/* Descrizione */}
          <div>
            <h3 className="text-lg font-semibold mb-2 text-gray-700">Descrizione:</h3>
            <p className="text-gray-600 bg-gray-50 p-4 rounded-lg">{issue.description || 'Nessuna descrizione'}</p>
          </div>

          {/* Dettagli */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Tipo:</h4>
              <p className="text-gray-600 bg-gray-50 p-2 rounded">{issue.type}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Stato:</h4>
              <p className="text-gray-600 bg-gray-50 p-2 rounded">{issue.status}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Priorità:</h4>
              <div className={`px-3 py-2 rounded font-semibold text-white text-center bg-gradient-to-r ${getPriorityGradient(issue.priority)}`}>
                {issue.priority}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-1">Assegnatario:</h4>
              <p className="text-gray-600 bg-gray-50 p-2 rounded">{issue.assignee}</p>
            </div>
          </div>

          {/* Data */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-1">Data:</h4>
            <p className="text-gray-600 bg-gray-50 p-2 rounded">{issue.date}</p>
          </div>

          {/* Immagine */}
          {issue.image && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Immagine:</h4>
              <img
                src={issue.image}
                alt="Issue attachment"
                className="w-full rounded-lg shadow-lg max-h-96 object-contain"
              />
            </div>
          )}

          {/* Chiudi */}
          <div className="pt-4">
            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-gradient-to-r from-purple-400 to-cyan-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
