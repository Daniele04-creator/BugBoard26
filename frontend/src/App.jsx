import React, { useState } from 'react';
import LoginScreen from './LoginScreen.jsx';
import BugBoard from './BugBoard.jsx';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);

  const handleLoginSuccess = (userInfo) => {
    // userInfo = { id, email, role }
    setCurrentUser(userInfo);
  };

  const handleLogout = () => {
    setCurrentUser(null);
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
