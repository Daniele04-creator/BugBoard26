import React, { useState, useEffect } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

export default function UserAdmin({ onClose, onCreateUser, currentUser, onLogout }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState("");

  // stato form creazione utente
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("USER");
  const [createError, setCreateError] = useState("");

  const isAdmin = currentUser?.role === "ADMIN";

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoadingUsers(true);
        setUsersError("");

        const resp = await fetch(`${API_BASE_URL}/api/admin/users`, {
          headers: {
            "X-User-Email": currentUser.email,
            "X-User-Role": currentUser.role,
          },
        });

        if (resp.status === 403) {
          setUsersError("Non hai i permessi per vedere la lista utenti");
          return;
        }

        if (!resp.ok) {
          setUsersError("Errore nel caricamento degli utenti");
          return;
        }

        const data = await resp.json();
        setUsers(data);
      } catch (err) {
        console.error("Errore caricamento utenti:", err);
        setUsersError("Errore di connessione al server");
      } finally {
        setLoadingUsers(false);
      }
    };

    if (isAdmin) {
      loadUsers();
    } else {
      setUsersError("Solo gli ADMIN possono gestire gli utenti");
      setLoadingUsers(false);
    }
  }, [currentUser, isAdmin]);

  const handleCreateUserSubmit = async (e) => {
    e.preventDefault();
    setCreateError("");

    if (!newEmail.trim() || !newPassword.trim()) {
      setCreateError("Email e password sono obbligatorie");
      return;
    }

    try {
      await onCreateUser({
        email: newEmail.trim(),
        password: newPassword.trim(),
        role: newRole,
      });

      setNewEmail("");
      setNewPassword("");
      setNewRole("USER");

      const resp = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: {
          "X-User-Email": currentUser.email,
          "X-User-Role": currentUser.role,
        },
      });
      if (resp.ok) {
        const data = await resp.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Errore creazione utente:", err);
      setCreateError("Errore nella creazione dell'utente");
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Sei sicuro di voler eliminare l'utente ${userEmail}?`)) {
      return;
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          "X-User-Email": currentUser.email,
          "X-User-Role": currentUser.role,
        },
      });

      if (resp.status === 403) {
        alert("Non hai i permessi per eliminare utenti");
        return;
      }

      if (resp.status === 400) {
        const msg = await resp.text();
        alert(msg || "Impossibile eliminare questo utente");
        return;
      }

      if (!resp.ok) {
        alert("Errore durante l'eliminazione dell'utente");
        return;
      }

      setUsers((prev) => prev.filter((u) => u.id !== userId));

      if (currentUser.id === userId) {
        alert("Hai eliminato il tuo account. Verrai disconnesso.");
        onClose();
        onLogout();
      }
    } catch (err) {
      console.error("Errore eliminazione utente:", err);
      alert("Errore di connessione al server");
    }
  };

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl">
          <h2 className="text-2xl font-semibold mb-4">Gestione Utenti</h2>
          <p className="text-red-600 mb-4">
            Non hai i permessi per accedere a questa sezione.
          </p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl p-8">
        {/* Header stile seconda immagine */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2
              className="text-3xl font-bold mb-2"
              style={{
                background: "linear-gradient(90deg, #7DD3FC 0%, #A78BFA 100%)",
                WebkitBackgroundClip: "text",
                color: "transparent",
              }}
            >
              Gestione Utenti
            </h2>
            <p className="text-gray-500 text-sm">
              Crea nuovi utenti e gestisci quelli esistenti.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>

        {/* FORM CREAZIONE – stile "Crea Utente" */}
        <div className="mb-8">
          <h3
            className="text-2xl font-semibold mb-4"
            style={{
              background: "linear-gradient(90deg, #7DD3FC 0%, #A78BFA 100%)",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            Crea Utente
          </h3>

          <form onSubmit={handleCreateUserSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Email:
              </label>
              <input
                type="email"
                placeholder="email@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Password:
              </label>
              <input
                type="password"
                placeholder="Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Ruolo:
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setNewRole("USER")}
                  className={`px-5 py-2 rounded-2xl text-sm font-semibold transition-all ${
                    newRole === "USER"
                      ? "text-white shadow-lg"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  style={
                    newRole === "USER"
                      ? {
                          background:
                            "linear-gradient(135deg, #7DD3FC 0%, #A78BFA 50%, #F472B6 100%)",
                        }
                      : {}
                  }
                >
                  User
                </button>
                <button
                  type="button"
                  onClick={() => setNewRole("ADMIN")}
                  className={`px-5 py-2 rounded-2xl text-sm font-semibold transition-all ${
                    newRole === "ADMIN"
                      ? "text-white shadow-lg"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  style={
                    newRole === "ADMIN"
                      ? {
                          background:
                            "linear-gradient(135deg, #FBBF24 0%, #F97316 50%, #F97373 100%)",
                        }
                      : {}
                  }
                >
                  Admin
                </button>
              </div>
            </div>

            {createError && (
              <p className="text-red-600 text-sm">{createError}</p>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-2xl bg-orange-100 text-orange-600 font-semibold hover:bg-orange-200"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="px-6 py-2 rounded-2xl text-white font-semibold shadow-lg hover:shadow-xl"
                style={{
                  background:
                    "linear-gradient(135deg, #34D399 0%, #10B981 50%, #059669 100%)",
                }}
              >
                Crea Utente
              </button>
            </div>
          </form>
        </div>

        {/* SEPARATORE */}
        <hr className="my-4" />

        {/* LISTA UTENTI – SENZA COLONNA ID */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Utenti esistenti</h3>

          {loadingUsers && <p>Caricamento utenti...</p>}
          {usersError && <p className="text-red-600">{usersError}</p>}

          {!loadingUsers && !usersError && users.length === 0 && (
            <p>Nessun utente trovato.</p>
          )}

          {!loadingUsers && !usersError && users.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-100">
                  <tr>
                    {/* ID RIMOSSO */}
                    <th className="px-3 py-2 text-left border-b">Email</th>
                    <th className="px-3 py-2 text-left border-b">Ruolo</th>
                    <th className="px-3 py-2 text-center border-b">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      {/* niente ID, solo Email e Ruolo */}
                      <td className="px-3 py-2 border-b">{u.email}</td>
                      <td className="px-3 py-2 border-b">{u.role}</td>
                      <td className="px-3 py-2 border-b text-center">
                        <button
                          onClick={() => handleDeleteUser(u.id, u.email)}
                          className="px-3 py-1 rounded-xl bg-red-600 text-white hover:bg-red-700 text-xs font-semibold"
                        >
                          Elimina
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
