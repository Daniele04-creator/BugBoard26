import React, { useState } from 'react';

export default function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({ email: false, password: false });

  const handleSubmit = () => {
    const newErrors = {
      email: !email.trim(),
      password: !password.trim()
    };

    setErrors(newErrors);

    if (!newErrors.email && !newErrors.password) {
      const fakeUser = {
        email,
        role: email === 'admin@bugboard.com' ? 'ADMIN' : 'USER'
      };

      if (onLoginSuccess) {
        onLoginSuccess(fakeUser);
      }
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Section - Login Form */}
      <div className="w-1/2 bg-white flex items-center justify-center relative overflow-hidden">
        <div
          className="absolute top-10 left-10 w-32 h-32 rounded-full opacity-5"
          style={{ background: 'linear-gradient(135deg, #7DD3FC 0%, #A78BFA 100%)' }}
        ></div>
        <div
          className="absolute bottom-20 right-20 w-40 h-40 rounded-full opacity-5"
          style={{ background: 'linear-gradient(135deg, #A78BFA 0%, #F472B6 100%)' }}
        ></div>

        <div className="w-full max-w-md px-8 z-10">
          <h1 className="text-5xl font-bold mb-16 text-gray-800 text-center">
            BugBoard26
          </h1>

          <div className="space-y-6">
            {/* Email */}
            <div className="transform transition-all hover:scale-105">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors({ ...errors, email: false });
                }}
                className={`w-full px-6 py-4 rounded-2xl text-white placeholder-white/70 text-center italic text-sm focus:outline-none transition-all shadow-lg ${
                  errors.email ? 'ring-2 ring-red-500' : 'focus:ring-2 focus:ring-cyan-400'
                }`}
                style={{
                  background: 'linear-gradient(90deg, #7DD3FC 0%, #A78BFA 100%)'
                }}
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-2 text-center italic">
                  Email richiesta
                </p>
              )}
            </div>

            {/* Password */}
            <div className="transform transition-all hover:scale-105">
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors({ ...errors, password: false });
                }}
                className={`w-full px-6 py-4 rounded-2xl text-white placeholder-white/70 text-center italic text-sm focus:outline-none transition-all shadow-lg ${
                  errors.password ? 'ring-2 ring-red-500' : 'focus:ring-2 focus:ring-cyan-400'
                }`}
                style={{
                  background: 'linear-gradient(90deg, #7DD3FC 0%, #A78BFA 100%)'
                }}
              />
              {errors.password && (
                <p className="text-red-500 text-xs mt-2 text-center italic">
                  Password richiesta
                </p>
              )}
            </div>

            {/* Submit */}
            <div className="pt-8 flex justify-center">
              <button
                onClick={handleSubmit}
                className="w-20 h-20 rounded-full flex items-center justify-center shadow-xl hover:scale-110 hover:shadow-2xl transition-all duration-300"
                style={{
                  background: 'linear-gradient(135deg, #F472B6 0%, #FBBF24 100%)'
                }}
              >
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
              </button>
            </div>

            <div className="pt-6 text-center">
              <button className="text-sm text-gray-400 hover:text-purple-500 transition-colors duration-200">
                Password dimenticata?
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Section */}
      <div
        className="w-1/2 flex items-center justify-center relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #7DD3FC 0%, #A78BFA 100%)'
        }}
      >
        <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-32 right-32 w-80 h-80 rounded-full bg-white/10 blur-3xl"></div>

        <div className="text-center z-10">
          <div className="text-white/20 text-4xl font-bold tracking-widest">
            LOGIN
          </div>
        </div>
      </div>
    </div>
  );
}
