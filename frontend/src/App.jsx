import React, { useState } from "react";
import LoginScreen from "./features/auth/screens/LoginScreen.jsx";
import BugBoard from "./features/issues/screens/BugBoard.jsx";

export default function App() {
  
  const [currentUser, setCurrentUser] = useState(null);

  const handleLoginSuccess = (userInfo) => {

    setCurrentUser(userInfo);
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
