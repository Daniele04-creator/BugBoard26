import React, { useState } from 'react';
import LoginScreen from './LoginScreen.jsx';
import BugBoard from './BugBoard.jsx';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    // Provo a leggere l'utente dal localStorage (se già loggato in passato)
    try {
      const raw = localStorage.getItem("currentUser");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error("Errore nel parsing di currentUser da localStorage:", e);
      return null;
    }
  });

  const handleLoginSuccess = (userInfo) => {
    // userInfo = { id, email, role, ... } restituito dal backend
    setCurrentUser(userInfo);
    // salvo anche su localStorage per persistenza al refresh
    localStorage.setItem("currentUser", JSON.stringify(userInfo));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("currentUser");
  };

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <BugBoard
      currentUser={currentUser}
      onLogout={handleLogout}
      onImpersonate={() => {}}
    />
  );
}
