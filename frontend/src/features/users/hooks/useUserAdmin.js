import { useState, useEffect } from "react";
import {
  fetchUsersAsAdmin,
  createUserAsAdmin,
  updateUserAsAdmin,
  deleteUserAsAdmin,
} from "../../../api/usersApi";

export function useUserAdmin({ currentUser, onClose, onLogout }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState("");

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("USER");
  const [createError, setCreateError] = useState("");
  const [errors, setErrors] = useState({});
  const [creatingUser, setCreatingUser] = useState(false);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("USER");
  const [editError, setEditError] = useState("");
  const [editErrors, setEditErrors] = useState({});
  const [updatingUser, setUpdatingUser] = useState(false);

  const isAdmin = currentUser?.role === "ADMIN";

  const DEFAULT_ADMIN_EMAIL = "admin@bugboard.com";
  const isDefaultAdmin = (u) =>
    (u?.email || "").toLowerCase() === DEFAULT_ADMIN_EMAIL;

  const reloadUsers = async () => {
    const data = await fetchUsersAsAdmin();
    setUsers(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoadingUsers(true);
        setUsersError("");
        await reloadUsers();
      } catch (err) {
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
  }, [isAdmin]);

  const handleCreateUserSubmit = async () => {
    if (creatingUser) return;

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
      setCreatingUser(true);
      await createUserAsAdmin(newUser);
      setNewEmail("");
      setNewPassword("");
      setNewRole("USER");
      setErrors({});
      setShowCreateDialog(false);
      await reloadUsers();
    } catch (err) {
      if (err.code === "FORBIDDEN") {
        setCreateError("Non hai i permessi per creare utenti");
      } else if (err.code === "BAD_REQUEST") {
        setCreateError(err.serverMessage || "Errore nella creazione dell'utente");
      } else if (err.code === "USER_ALREADY_EXISTS") {
        setCreateError("Esiste già un utente con questa email");
      } else {
        setCreateError("Errore nella creazione dell'utente");
      }
    } finally {
      setCreatingUser(false);
    }
  };

  const handleCancelCreate = () => {
    if (creatingUser) return;
    setShowCreateDialog(false);
    setNewEmail("");
    setNewPassword("");
    setNewRole("USER");
    setErrors({});
    setCreateError("");
  };

  const handleOpenEditUser = (user) => {
    if (isDefaultAdmin(user)) {
      alert("Questo è l'admin di sistema: non può essere modificato.");
      return;
    }
    setEditId(user.id);
    setEditEmail(user.email || "");
    setEditPassword("");
    setEditRole(user.role || "USER");
    setEditErrors({});
    setEditError("");
    setShowEditDialog(true);
  };

  const handleEditUserSubmit = async () => {
    if (updatingUser) return;

    const newErrs = {
      email: !editEmail.trim(),
    };
    setEditErrors(newErrs);
    setEditError("");

    if (newErrs.email) {
      setEditError("Email obbligatoria");
      return;
    }

    const payload = {
      email: editEmail.trim(),
      role: editRole,
      password: editPassword.trim() ? editPassword.trim() : "",
    };

    try {
      setUpdatingUser(true);
      await updateUserAsAdmin(editId, payload);
      setShowEditDialog(false);
      setEditId(null);
      setEditEmail("");
      setEditPassword("");
      setEditRole("USER");
      setEditErrors({});
      setEditError("");
      await reloadUsers();
    } catch (err) {
      if (err.code === "FORBIDDEN") {
        setEditError("Non hai i permessi per modificare utenti");
      } else if (err.code === "BAD_REQUEST") {
        setEditError(err.serverMessage || "Errore nella modifica dell'utente");
      } else if (err.code === "USER_ALREADY_EXISTS") {
        setEditError("Esiste già un utente con questa email");
      } else {
        setEditError("Errore nella modifica dell'utente");
      }
    } finally {
      setUpdatingUser(false);
    }
  };

  const handleCancelEdit = () => {
    if (updatingUser) return;
    setShowEditDialog(false);
    setEditId(null);
    setEditEmail("");
    setEditPassword("");
    setEditRole("USER");
    setEditErrors({});
    setEditError("");
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if ((userEmail || "").toLowerCase() === DEFAULT_ADMIN_EMAIL) {
      alert("Questo è l'admin di sistema: non può essere eliminato.");
      return;
    }

    if (!window.confirm(`Sei sicuro di voler eliminare l'utente ${userEmail}?`)) {
      return;
    }

    try {
      await deleteUserAsAdmin(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      if (currentUser?.id === userId) {
        alert("Hai eliminato il tuo account. Verrai disconnesso.");
        onClose?.();
        onLogout?.();
      }
    } catch (err) {
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
    setErrors,
    creatingUser,
    handleCreateUserSubmit,
    handleCancelCreate,

    showEditDialog,
    setShowEditDialog,
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

    handleDeleteUser,
  };
}
