import React, { useState } from 'react';
import LoginScreen from './LoginScreen.jsx';
import BugBoard from './BugBoard.jsx';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);

  const handleLoginSuccess = (userInfo) => {
    setCurrentUser(userInfo);
  };

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return <BugBoard currentUser={currentUser} />;
}
