import React, { useState } from 'react';
import { Edit, Trash2, X, Image as ImageIcon } from 'lucide-react';

export default function IssueManage({
  issues,
  priorities,
  statuses,
  getPriorityGradient,
  editingItem,
  setEditingItem,
  handleDelete,
  handleUpdate,
  currentUser,
  isAdmin,
  onLogout,
}) {
  const [imagePreview, setImagePreview] = useState(null);

  // Permessi: l'admin può tutto; un utente può modificare/eliminare solo le issue a lui assegnate.
  // Per compatibilità con i dati di esempio (assegnatari come 'luca', 'sara', ecc.)
  // confrontiamo sia l'email completa che la parte locale (prima della @).
  const canEditIssue = (issue) => {
    if (isAdmin) return true;
    const assignee = (issue?.assignee || '').toLowerCase();
    const userEmail = (currentUser?.email || '').toLowerCase();
    if (!assignee || !userEmail) return false;
    const userLocal = userEmail.split('@')[0];
    return assignee === userEmail || assignee === userLocal;
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        setEditingItem({ ...editingItem, image: base64 });
        setImagePreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div
      className="flex-1 p-8 flex items-center justify-center overflow-auto"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl p-8 relative">
        {!editingItem && (
          <h2 className="text-3xl font-bold mb-8">Gestione Issue</h2>
        )}

        {editingItem ? (
          /* MODALITÀ MODIFICA */
          <div className="w-full max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-teal-500 to-green-400 bg-clip-text text-transparent">
                Modifica Issue
              </h2>
              <button
                onClick={() => setEditingItem(null)}
                className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-all"
              >
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="col-span-2">
                <label className="block text-lg font-semibold mb-3">
                  Titolo:
                </label>
                <input
                  type="text"
                  value={editingItem.title}
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, title: e.target.value })
                  }
                  className="w-full bg-gray-100 rounded-xl px-4 py-3 text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-400 transition-all"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-lg font-semibold mb-3">
                  Stato:
                </label>
                <div className="flex gap-3">
                  {statuses.map((s) => (
                    <button
                      key={s}
                      onClick={() =>
                        setEditingItem({ ...editingItem, status: s })
                      }
                      className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                        editingItem.status === s
                          ? 'bg-gradient-to-r from-purple-400 to-cyan-400 text-white shadow-lg'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2">
                <label className="block text-lg font-semibold mb-3">
                  Priorità:
                </label>
                <div className="flex gap-3">
                  {priorities.map((p) => (
                    <button
                      key={p}
                      onClick={() =>
                        setEditingItem({ ...editingItem, priority: p })
                      }
                      className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                        editingItem.priority === p
                          ? `bg-gradient-to-r ${getPriorityGradient(
                              p
                            )} text-white shadow-lg`
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Immagine */}
            <div className="col-span-2 mb-6">
              <label className="block text-lg font-semibold mb-3">Immagine:</label>
              <div className="flex gap-4 items-start">
                <label className="px-6 py-3 bg-gradient-to-r from-purple-400 to-cyan-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all cursor-pointer">
                  <ImageIcon className="inline mr-2" size={20} />
                  Carica Immagine
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
                {(imagePreview || editingItem?.image) && (
                  <div className="relative">
                    <img
                      src={imagePreview || editingItem?.image}
                      alt="Preview"
                      className="h-24 w-24 object-cover rounded-lg shadow-lg"
                    />
                    <button
                      onClick={() => {
                        setImagePreview(null);
                        setEditingItem({ ...editingItem, image: null });
                      }}
                      className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-8">
              <button
                onClick={() => setEditingItem(null)}
                className="px-8 py-3 bg-gradient-to-r from-red-400 to-orange-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                Annulla
              </button>
              <button
                onClick={handleUpdate}
                className="px-8 py-3 bg-gradient-to-r from-teal-500 to-green-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                Salva Modifiche
              </button>
            </div>
          </div>
        ) : (
          /* MODALITÀ LISTA GESTIONE */
          <div className="bg-gray-100 rounded-2xl p-6 min-h-96">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-500 italic border-b border-gray-300">
                  <th className="pb-3 font-medium">Titolo</th>
                  <th className="pb-3 font-medium">Assegnatario</th>
                  <th className="pb-3 font-medium">Stato</th>
                  <th className="pb-3 font-medium text-right">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => {
                  const canEdit = canEditIssue(issue);

                  return (
                    <tr
                      key={issue.id}
                      className={`border-b border-gray-300 transition-colors ${
                        !canEdit ? 'opacity-50 bg-gray-50' : 'hover:bg-white'
                      }`}
                    >
                      <td className="py-3 font-medium text-gray-700">
                        {issue.title}
                      </td>
                      <td className="py-3 text-gray-600">
                        {issue.assignee}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            issue.status === 'DONE'
                              ? 'bg-green-100 text-green-600'
                              : 'bg-yellow-100 text-yellow-600'
                          }`}
                        >
                          {issue.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {canEdit ? (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingItem(issue)}
                              className="p-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-all"
                              title="Modifica"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(issue.id)}
                              className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-all"
                              title="Elimina"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 flex items-center justify-end gap-1 italic">
                            Solo Lettura
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
