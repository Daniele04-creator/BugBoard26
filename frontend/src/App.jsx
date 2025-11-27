import React, { useState } from 'react';
import LoginScreen from './LoginScreen';
import BugBoard from './BugBoard';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);

  const handleLoginSuccess = (userInfo) => {
    // userInfo = { id, email, role }
    setCurrentUser(userInfo);
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  const handleImpersonate = (userInfo) => {
    // Simula il login come un altro utente (usato per testing)
    // userInfo expected: { email, role }
    setCurrentUser(userInfo);
  };

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // Passiamo l'utente loggato al BugBoard (per permessi ecc.)
  return <BugBoard currentUser={currentUser} onLogout={handleLogout} onImpersonate={handleImpersonate} />;
}
