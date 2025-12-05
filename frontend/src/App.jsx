import React, { useState } from "react";
import LoginScreen from "./features/auth/screens/LoginScreen.jsx";
import BugBoard from "./issues/BugBoard.jsx";

export default function App() {
  // Nessun localStorage, nessun recupero automatico
  const [currentUser, setCurrentUser] = useState(null);

  const handleLoginSuccess = (userInfo) => {
    // utente valido solo per questa "sessione" di React
    setCurrentUser(userInfo);
  };

  const handleLogout = () => {
    // torna al login
    setCurrentUser(null);

    // nel dubbio, pulisci eventuale roba vecchia (se esiste ancora)
    localStorage.removeItem("currentUser");
  };

  // se non c'è utente loggato → mostra login
  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // se c'è utente loggato → mostra BugBoard
  return (
    <BugBoard
      currentUser={currentUser}
      onLogout={handleLogout}
      onImpersonate={() => {}}
    />
  );
}
