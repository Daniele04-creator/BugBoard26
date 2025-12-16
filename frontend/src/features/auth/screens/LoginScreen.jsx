import React from "react";
import LoginForm from "../components/LoginForm";
import LoginVideoPanel from "../components/LoginVideoPanel";

export default function LoginScreen({ onLoginSuccess }) {
  return (
    <div className="min-h-screen flex">
      {/* SINISTRA – LOGIN */}
      <div className="w-1/2 bg-white flex items-center justify-center relative overflow-hidden animate-fadeIn">
        <div
          className="absolute top-10 left-10 w-32 h-32 rounded-full opacity-5"
          style={{
            background:
              "linear-gradient(135deg, #7DD3FC 0%, #A78BFA 100%)",
          }}
        ></div>

        <div
          className="absolute bottom-20 right-20 w-40 h-40 rounded-full opacity-5"
          style={{
            background:
              "linear-gradient(135deg, #A78BFA 0%, #F472B6 100%)",
          }}
        ></div>

        <div className="w-full max-w-md px-8 z-10">
          <h1 className="text-5xl font-bold mb-16 text-gray-800 text-center">
            BugBoard26
          </h1>

          <LoginForm onLoginSuccess={onLoginSuccess} />
        </div>
      </div>

      {/* DESTRA – VIDEO */}
      <LoginVideoPanel />
    </div>
  );
}
