import { useState, useEffect } from "react";
import {
  fetchUsersAsAdmin,
  createUserAsAdmin,
  deleteUserAsAdmin,
} from "../../../api/usersApi";

export function useUserAdmin({ currentUser, onCreateUser, onClose, onLogout }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState("");

  // stato dialog creazione utente
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("USER");
  const [createError, setCreateError] = useState("");
  const [errors, setErrors] = useState({});

  const isAdmin = currentUser?.role === "ADMIN";

  // Carica utenti all'apertura (solo se ADMIN)
  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoadingUsers(true);
        setUsersError("");

        const data = await fetchUsersAsAdmin(currentUser);
        setUsers(data);
      } catch (err) {
        console.error("Errore caricamento utenti:", err);

        if (err.code === "FORBIDDEN") {
          setUsersError("Non hai i permessi per vedere la lista utenti");
        } else {
          setUsersError("Errore nel caricamento degli utenti");
        }
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

  // submit creazione utente (dal dialog)
  const handleCreateUserSubmit = async () => {
    const newErrors = {
      email: !newEmail.trim(),
      password: !newPassword.trim(),
    };
    setErrors(newErrors);
    setCreateError("");

    if (newErrors.email || newErrors.password) {
      setCreateError("Email e password sono obbligatorie");
      return;
    }

    const newUser = {
      email: newEmail.trim(),
      password: newPassword.trim(),
      role: newRole,
    };

    try {
      await createUserAsAdmin(currentUser, newUser);

      if (onCreateUser) {
        onCreateUser(newUser);
      }

      // reset form
      setNewEmail("");
      setNewPassword("");
      setNewRole("USER");
      setErrors({});
      setShowCreateDialog(false);

      // ricarica lista utenti
      const data = await fetchUsersAsAdmin(currentUser);
      setUsers(data);
    } catch (err) {
      console.error("Errore creazione utente:", err);

      if (err.code === "FORBIDDEN") {
        setCreateError("Non hai i permessi per creare utenti");
      } else if (err.code === "BAD_REQUEST") {
        setCreateError(err.serverMessage || "Errore nella creazione dell'utente");
      } else {
        setCreateError("Errore nella creazione dell'utente");
      }
    }
  };

  const handleCancelCreate = () => {
    setShowCreateDialog(false);
    setNewEmail("");
    setNewPassword("");
    setNewRole("USER");
    setErrors({});
    setCreateError("");
  };

  // eliminazione utente
  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Sei sicuro di voler eliminare l'utente ${userEmail}?`)) {
      return;
    }

    try {
      await deleteUserAsAdmin(currentUser, userId);

      setUsers((prev) => prev.filter((u) => u.id !== userId));

      if (currentUser.id === userId) {
        alert("Hai eliminato il tuo account. Verrai disconnesso.");
        onClose?.();
        onLogout?.();
      }
    } catch (err) {
      console.error("Errore eliminazione utente:", err);

      if (err.code === "FORBIDDEN") {
        alert("Non hai i permessi per eliminare utenti");
      } else if (err.code === "BAD_REQUEST") {
        alert(err.serverMessage || "Impossibile eliminare questo utente");
      } else {
        alert("Errore durante l'eliminazione dell'utente");
      }
    }
  };

  return {
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

    handleCreateUserSubmit,
    handleCancelCreate,
    handleDeleteUser,
  };
}
