import React from "react";
import { Plus, X, Trash2, Edit } from "lucide-react";
import { useUserAdmin } from "../hooks/useUserAdmin";

export default function UserAdminScreen({ onClose, currentUser, onLogout }) {
  const {
    isAdmin,
    users,
    loadingUsers,
    usersError,

    showCreateDialog,
    setShowCreateDialog,

    newEmail,
    setNewEmail,
    newPassword,
    setNewPassword,
    newRole,
    setNewRole,
    createError,
    errors,
    setErrors,

    handleCreateUserSubmit,
    handleCancelCreate,
    handleDeleteUser,

    showEditDialog,
    editId,
    editEmail,
    setEditEmail,
    editPassword,
    setEditPassword,
    editRole,
    setEditRole,
    editError,
    editErrors,
    setEditErrors,
    handleOpenEditUser,
    handleEditUserSubmit,
    handleCancelEdit,
  } = useUserAdmin({ currentUser, onClose, onLogout });

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-lg">
          <h2 className="text-2xl font-bold mb-4">Gestione Utenti</h2>
          <p className="text-red-600 mb-4">
            Non hai i permessi per accedere a questa sezione.
          </p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 transition-all"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-8">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl p-8 max-h-[90vh] overflow-y-auto animate-fadeIn">
          <div className="flex justify-between items-start mb-8">
            <h2 className="text-3xl font-bold">Gestione Utenti</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-700 text-2xl transition-colors"
            >
              <X size={28} />
            </button>
          </div>

          <div className="mb-6">
            <button
              onClick={() => setShowCreateDialog(true)}
              className="px-8 py-3 bg-gradient-to-r from-purple-400 to-cyan-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
            >
              <Plus size={20} />
              Crea Nuovo Utente
            </button>
          </div>

          <div className="bg-gray-100 rounded-2xl p-6 min-h-96">
            <h3 className="text-xl font-bold mb-4">Utenti Esistenti</h3>

            {usersError && (
              <p className="text-center py-6 text-red-600">{usersError}</p>
            )}

            {loadingUsers && !usersError && (
              <p className="text-center py-6 text-gray-500">
                Caricamento utenti...
              </p>
            )}

            {!loadingUsers && !usersError && users.length === 0 && (
              <p className="text-center py-6 text-gray-500 italic">
                Nessun utente trovato.
              </p>
            )}

            {!loadingUsers && !usersError && users.length > 0 && (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-gray-500 italic border-b border-gray-300">
                    <th className="pb-3 font-medium">Email</th>
                    <th className="pb-3 font-medium">Ruolo</th>
                    <th className="pb-3 font-medium text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-gray-300 transition-colors hover:bg-white"
                    >
                      <td className="py-3 font-medium text-gray-700">
                        {u.email}
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            u.role === "ADMIN"
                              ? "bg-red-100 text-red-600"
                              : "bg-blue-100 text-blue-600"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditUser(u)}
                            className="p-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-all"
                            title="Modifica"
                          >
                            <Edit size={16} />
                          </button>

                          <button
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-all"
                            title="Elimina"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-8">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 animate-fadeIn">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold">Nuovo Utente</h2>
              <button
                onClick={handleCancelCreate}
                className="text-gray-400 hover:text-gray-700 text-2xl transition-colors"
              >
                <X size={28} />
              </button>
            </div>

            <div className="mb-6">
              <label className="block text-lg font-semibold mb-3">
                * Email:
              </label>
              <input
                type="text"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setErrors({ ...errors, email: false });
                }}
                className={`w-full bg-gray-100 rounded-xl px-4 py-3 text-gray-600 focus:outline-none transition-all ${
                  errors.email
                    ? "ring-2 ring-red-500"
                    : "focus:ring-2 focus:ring-purple-400"
                }`}
                placeholder="email@example.com"
              />
            </div>

            <div className="mb-6">
              <label className="block text-lg font-semibold mb-3">
                * Password:
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setErrors({ ...errors, password: false });
                }}
                className={`w-full bg-gray-100 rounded-xl px-4 py-3 text-gray-600 focus:outline-none transition-all ${
                  errors.password
                    ? "ring-2 ring-red-500"
                    : "focus:ring-2 focus:ring-purple-400"
                }`}
                placeholder="Password sicura"
              />
            </div>

            <div className="mb-8">
              <label className="block text-lg font-semibold mb-3">Ruolo:</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setNewRole("USER")}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                    newRole === "USER"
                      ? "bg-gradient-to-r from-purple-400 to-cyan-400 text-white shadow-lg"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  User
                </button>
                <button
                  onClick={() => setNewRole("ADMIN")}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                    newRole === "ADMIN"
                      ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Admin
                </button>
              </div>
            </div>

            {createError && (
              <p className="text-red-600 mb-4 text-sm">{createError}</p>
            )}

            <div className="flex gap-4 justify-end">
              <button
                onClick={handleCancelCreate}
                className="px-8 py-3 bg-gradient-to-r from-red-400 to-orange-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                Annulla
              </button>
              <button
                onClick={handleCreateUserSubmit}
                className="px-8 py-3 bg-gradient-to-r from-teal-500 to-green-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                Crea
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-8">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 animate-fadeIn">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold">Modifica Utente</h2>
              <button
                onClick={handleCancelEdit}
                className="text-gray-400 hover:text-gray-700 text-2xl transition-colors"
              >
                <X size={28} />
              </button>
            </div>
            <div className="mb-6">
              <label className="block text-lg font-semibold mb-3">
                * Email:
              </label>
              <input
                type="text"
                value={editEmail}
                onChange={(e) => {
                  setEditEmail(e.target.value);
                  setEditErrors({ ...editErrors, email: false });
                }}
                className={`w-full bg-gray-100 rounded-xl px-4 py-3 text-gray-600 focus:outline-none transition-all ${
                  editErrors.email
                    ? "ring-2 ring-red-500"
                    : "focus:ring-2 focus:ring-purple-400"
                }`}
              />
            </div>

            <div className="mb-6">
              <label className="block text-lg font-semibold mb-3">
                Password (lascia vuota se non vuoi cambiarla):
              </label>
              <input
                type="password"
                value={editPassword}
                onChange={(e) => {
                  setEditPassword(e.target.value);
                }}
                className="w-full bg-gray-100 rounded-xl px-4 py-3 text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-400 transition-all"
                placeholder="Nuova password (opzionale)"
              />
            </div>

            <div className="mb-8">
              <label className="block text-lg font-semibold mb-3">Ruolo:</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditRole("USER")}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                    editRole === "USER"
                      ? "bg-gradient-to-r from-purple-400 to-cyan-400 text-white shadow-lg"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  User
                </button>
                <button
                  onClick={() => setEditRole("ADMIN")}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                    editRole === "ADMIN"
                      ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  Admin
                </button>
              </div>
            </div>

            {editError && (
              <p className="text-red-600 mb-4 text-sm">{editError}</p>
            )}

            <div className="flex gap-4 justify-end">
              <button
                onClick={handleCancelEdit}
                className="px-8 py-3 bg-gradient-to-r from-red-400 to-orange-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                Annulla
              </button>
              <button
                onClick={handleEditUserSubmit}
                className="px-8 py-3 bg-gradient-to-r from-teal-500 to-green-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
