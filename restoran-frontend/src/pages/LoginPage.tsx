import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err: any) {
      console.error("LOGIN ERROR", err);
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        "Giriş başarısız";
      setError(msg);
   } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#BDB8B8] to-[#E3D6EB]">
      <div className="w-full max-w-md bg-white border border-[#E5E5E5] rounded-2xl p-6 shadow-xl">
        <div className="mb-4 text-center">
          <h1 className="text-2xl font-bold text-[#8F1A9F]">Cadinin Evi</h1>
          <p className="text-xs text-[#555555] mt-1">
            Restoran Yönetim Paneli Girişi
          </p>
        </div>

        <form className="space-y-4 mt-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-medium text-[#555555] mb-1">
              E-posta
            </label>
            <input
              type="email"
              className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F] text-sm text-[#000000] bg-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#555555] mb-1">
              Şifre
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 rounded-lg border border-[#E5E5E5] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F] text-sm text-[#000000] bg-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-100 border border-red-300 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-[#8F1A9F] hover:bg-[#7a168c] text-sm font-semibold text-white transition-colors disabled:opacity-60"
          >
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </div>
    </div>
  );
};
