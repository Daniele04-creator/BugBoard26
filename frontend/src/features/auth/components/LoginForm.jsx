// src/features/auth/components/LoginForm.jsx
import React, { useState } from "react";
import PasswordInput from "./PasswordInput";
import { useLogin } from "../hooks/useLogin";

export default function LoginForm({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({ email: false, password: false });

  const { isLoading, apiError, handleLogin, setApiError } =
    useLogin(onLoginSuccess);

  const handleSubmit = async () => {
    setApiError("");

    const newErrors = {
      email: !email.trim(),
      password: !password.trim(),
    };
    setErrors(newErrors);

    if (newErrors.email || newErrors.password) return;

    await handleLogin(email, password);
  };

  return (
    <div className="space-y-6">
      {/* Email */}
      <div className="transform transition-all hover:scale-105">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((prev) => ({ ...prev, email: false }));
            setApiError("");
          }}
          className={`w-full px-6 py-4 rounded-2xl text-white placeholder-white/70 text-center italic text-sm focus:outline-none transition-all shadow-lg ${
            errors.email
              ? "ring-2 ring-red-500"
              : "focus:ring-2 focus:ring-cyan-400"
          }`}
          style={{
            background: "linear-gradient(90deg, #7DD3FC 0%, #A78BFA 100%)",
          }}
        />
        {errors.email && (
          <p className="text-red-500 text-xs mt-2 text-center italic">
            Email richiesta
          </p>
        )}
      </div>

      {/* Password */}
      <PasswordInput
        value={password}
        hasError={errors.password}
        onChange={(newValue) => {
          setPassword(newValue);
          setErrors((prev) => ({ ...prev, password: false }));
          setApiError("");
        }}
      />

      {/* Errore API */}
      {apiError && (
        <p className="text-red-500 text-sm mt-2 text-center italic">
          {apiError}
        </p>
      )}

      {/* Submit */}
      <div className="pt-8 flex justify-center">
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-20 h-20 rounded-full flex items-center justify-center shadow-xl hover:scale-110 hover:shadow-2xl transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #F472B6 0%, #FBBF24 100%)",
          }}
        >
          {isLoading ? (
            <span className="text-white text-xs font-semibold">...</span>
          ) : (
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
