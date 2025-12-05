// src/features/auth/components/PasswordInput.jsx
import React, { useState } from "react";

export default function PasswordInput({ value, onChange, hasError }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="transform transition-all hover:scale-105 relative">
      <input
        type={showPassword ? "text" : "password"}
        placeholder="Password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-6 py-4 pr-14 rounded-2xl text-white placeholder-white/70
          text-center italic text-sm focus:outline-none transition-all shadow-lg ${
            hasError ? "ring-2 ring-red-500" : "focus:ring-2 focus:ring-cyan-400"
          }`}
        style={{
          background: "linear-gradient(90deg, #7DD3FC 0%, #A78BFA 100%)",
        }}
      />

      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white/80 hover:text-white"
      >
        {showPassword ? (
          // occhio aperto
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274
                4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        ) : (
          // occhio sbarrato
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477
                0-8.268-2.943-9.542-7a9.97 9.97 0 012.223-3.592m3.478-2.51A9.956
                9.956 0 0112 5c4.478 0 8.268 2.943 9.542 7a9.97 9.97 0
                01-1.33 2.68M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 3l18 18"
            />
          </svg>
        )}
      </button>

      {hasError && (
        <p className="text-red-500 text-xs mt-2 text-center italic">
          Password richiesta
        </p>
      )}
    </div>
  );
}
