import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function UserAdmin({ onClose, onCreateUser }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [errors, setErrors] = useState({ email: false, password: false });

  const handleCreate = () => {
    const newErrors = { email: false, password: false };

    if (!email.trim()) {
      newErrors.email = true;
    }
    if (!password.trim()) {
      newErrors.password = true;
    }

    if (newErrors.email || newErrors.password) {
      setErrors(newErrors);
      return;
    }

    onCreateUser({ email, password, isAdmin });
    setEmail('');
    setPassword('');
    setIsAdmin(false);
    setErrors({ email: false, password: false });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
            Crea Utente
          </h2>
          <button
            onClick={onClose}
            className="p-2 bg-gray-200 rounded-full hover:bg-gray-300 transition-all"
          >
            <X size={24} />
          </button>
        </div>

        {/* Email */}
        <div className="mb-6">
          <label className="block text-lg font-semibold mb-3">Email:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrors({ ...errors, email: false });
            }}
            className={`w-full bg-gray-100 rounded-xl px-4 py-3 text-gray-600 focus:outline-none transition-all ${
              errors.email ? 'ring-2 ring-red-500' : 'focus:ring-2 focus:ring-purple-400'
            }`}
            placeholder="email@example.com"
          />
          {errors.email && <p className="text-red-500 text-sm mt-2">Email obbligatoria</p>}
        </div>

        {/* Password */}
        <div className="mb-6">
          <label className="block text-lg font-semibold mb-3">Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors({ ...errors, password: false });
            }}
            className={`w-full bg-gray-100 rounded-xl px-4 py-3 text-gray-600 focus:outline-none transition-all ${
              errors.password ? 'ring-2 ring-red-500' : 'focus:ring-2 focus:ring-purple-400'
            }`}
            placeholder="Password"
          />
          {errors.password && <p className="text-red-500 text-sm mt-2">Password obbligatoria</p>}
        </div>

        {/* Ruolo */}
        <div className="mb-8">
          <label className="block text-lg font-semibold mb-3">Ruolo:</label>
          <div className="flex gap-3">
            <button
              onClick={() => setIsAdmin(false)}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                !isAdmin
                  ? 'bg-gradient-to-r from-purple-400 to-cyan-400 text-white shadow-lg'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              User
            </button>
            <button
              onClick={() => setIsAdmin(true)}
              className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                isAdmin
                  ? 'bg-gradient-to-r from-red-400 to-pink-500 text-white shadow-lg'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Admin
            </button>
          </div>
        </div>

        {/* Bottoni azione */}
        <div className="flex gap-4 justify-end">
          <button
            onClick={onClose}
            className="px-8 py-3 bg-gradient-to-r from-red-400 to-orange-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            Annulla
          </button>
          <button
            onClick={handleCreate}
            className="px-8 py-3 bg-gradient-to-r from-teal-500 to-green-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            Crea Utente
          </button>
        </div>
      </div>
    </div>
  );
}
