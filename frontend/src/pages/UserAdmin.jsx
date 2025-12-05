import React, { useState, useEffect } from "react";

// Usa la stessa logica di BugBoard per la base URL
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

  // Carica lista utenti all'apertura del modal
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

        const data = await resp.json(); // atteso: array di {id, email, role}
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
  }, [API_BASE_URL, currentUser, isAdmin]);

  // Gestione creazione utente (usa la tua funzione già esistente)
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

      // dopo creazione, reset del form e ricarica lista utenti
      setNewEmail("");
      setNewPassword("");
      setNewRole("USER");

      // ricarica utenti
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

      // aggiorna lista utenti
      setUsers((prev) => prev.filter((u) => u.id !== userId));

      // se ho eliminato me stesso → logout e chiudi modal
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

  // se qualcuno ci arriva qui senza essere admin
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-xl p-6 w-full max-w-lg">
          <h2 className="text-xl font-semibold mb-4">Gestione Utenti</h2>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">Gestione Utenti</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        {/* FORM CREAZIONE UTENTE */}
        <div className="mb-6 border-b pb-4">
          <h3 className="text-lg font-semibold mb-3">Crea nuovo utente</h3>
          <form onSubmit={handleCreateUserSubmit} className="space-y-3">
            <div className="flex gap-3">
              <input
                type="email"
                placeholder="Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2"
              />
              <input
                type="password"
                placeholder="Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2"
              />
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="border rounded-lg px-3 py-2"
              >
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            {createError && (
              <p className="text-red-600 text-sm">{createError}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                Crea utente
              </button>
            </div>
          </form>
        </div>

        {/* LISTA UTENTI */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Utenti esistenti</h3>

          {loadingUsers && <p>Caricamento utenti...</p>}
          {usersError && <p className="text-red-600">{usersError}</p>}

          {!loadingUsers && !usersError && users.length === 0 && (
            <p>Nessun utente trovato.</p>
          )}

          {!loadingUsers && !usersError && users.length > 0 && (
            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1">ID</th>
                  <th className="border px-2 py-1">Email</th>
                  <th className="border px-2 py-1">Ruolo</th>
                  <th className="border px-2 py-1">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="border px-2 py-1">{u.id}</td>
                    <td className="border px-2 py-1">{u.email}</td>
                    <td className="border px-2 py-1">{u.role}</td>
                    <td className="border px-2 py-1 text-center">
                      <button
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs"
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
