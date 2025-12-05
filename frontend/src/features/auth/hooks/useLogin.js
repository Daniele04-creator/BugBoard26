// src/features/auth/hooks/useLogin.js
import { useState } from "react";
import { login } from "../../../api/authApi";

export function useLogin(onLoginSuccess) {
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  const handleLogin = async (email, password) => {
    setApiError("");
    setIsLoading(true);

    try {
      const data = await login(email, password);
      if (onLoginSuccess) {
        onLoginSuccess(data);
      }
    } catch (err) {
      console.error("Errore login:", err);

      if (err.message === "INVALID_CREDENTIALS") {
        setApiError("Email o password non valide");
      } else {
        setApiError("Errore dal server");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    apiError,
    handleLogin,
    setApiError,
  };
}
