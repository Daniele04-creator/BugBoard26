import React, { useState } from 'react';
import LoginScreen from './auth/LoginScreen.jsx';
import BugBoard from './issues/BugBoard.jsx';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const raw = localStorage.getItem("currentUser");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error("Errore nel parsing di currentUser:", e);
      return null;
    }
  });

  const handleLoginSuccess = (userInfo) => {
    setCurrentUser(userInfo);
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
