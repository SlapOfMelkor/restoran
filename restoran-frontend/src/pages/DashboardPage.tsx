import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const circleBase =
  "w-16 h-16 rounded-full bg-[#ff9800] shadow-[0_0_30px_rgba(162,0,255,0.85)] ring-4 ring-[#c218f0] flex items-center justify-center";
const circleLabel =
  "mt-2 text-[11px] font-extrabold text-[#9c27b0] leading-tight text-center tracking-wide";

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const isSuperAdmin = user?.role === "super_admin";

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const roleLabel = isSuperAdmin ? "SÜPER ADMİN" : "ŞUBE ADMİNİ";

  return (
    <div className="min-h-screen flex flex-col">
      {/* Üst başlık */}
      <div className="bg-[#e8e8e8] px-5 pt-6 pb-3 shadow-sm">
        <h1 className="text-[18px] font-extrabold tracking-wide text-[#8e24aa]">
          CADININ EVİ
        </h1>
        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#5f5f5f]">
          RESTORAN YÖNETİM PANELİ
        </p>
      </div>

      {/* Ana menü ikonları */}
      <div className="flex-1 px-6 pt-6 pb-4 space-y-6">
        {/* Üst menü (ANA SAYFA, GÜNLÜK PARA GİRİŞİ, MERKEZ SEVKİYATLARI) */}
        <div className="grid grid-cols-3 gap-y-6 place-items-center">
          <button
            onClick={() => navigate("/")}
            className="flex flex-col items-center active:scale-[0.97] transition"
          >
            <div className={circleBase}>
              <span className="text-2xl text-[#6a1b9a]">🏠</span>
            </div>
            <span className={circleLabel}>
              ANA
              <br />
              SAYFA
            </span>
          </button>

          <button
            onClick={() => navigate("/cash")}
            className="flex flex-col items-center active:scale-[0.97] transition"
          >
            <div className={circleBase}>
              <span className="text-2xl text-[#6a1b9a]">💵</span>
            </div>
            <span className={circleLabel}>
              GÜNLÜK
              <br />
              PARA GİRİŞİ
            </span>
          </button>

          <button
            onClick={() => navigate("/shipments")}
            className="flex flex-col items-center active:scale-[0.97] transition"
          >
            <div className={circleBase}>
              <span className="text-2xl text-[#6a1b9a]">🚚</span>
            </div>
            <span className={circleLabel}>
              SEVKİYATLAR
            </span>
          </button>

          {/* Alt menü (STOK GÜNCELLEME, GİDERLER, FİNANSAL ÖZET) */}
          <button
            onClick={() => navigate("/stock")}
            className="flex flex-col items-center active:scale-[0.97] transition"
          >
            <div className={circleBase}>
              <span className="text-2xl text-[#6a1b9a]">📦</span>
            </div>
            <span className={circleLabel}>
              STOK
              <br />
              GÜNCELLEME
            </span>
          </button>

          <button
            onClick={() => navigate("/expenses")}
            className="flex flex-col items-center active:scale-[0.97] transition"
          >
            <div className={circleBase}>
              <span className="text-2xl text-[#6a1b9a]">🧾</span>
            </div>
            <span className={circleLabel}>
              GİDERLER
            </span>
          </button>

          <button
            onClick={() => navigate("/financial-summary")}
            className="flex flex-col items-center active:scale-[0.97] transition"
          >
            <div className={circleBase}>
              <span className="text-2xl text-[#6a1b9a]">📊</span>
            </div>
            <span className={circleLabel}>
              FİNANSAL
              <br />
              ÖZET
            </span>
          </button>
        </div>

        {/* Yönetim başlığı */}
        {isSuperAdmin && (
          <>
            <div className="mt-2 -mx-6 bg-[#e8e8e8] h-8 flex items-center justify-center shadow-sm">
              <span className="text-[11px] font-semibold tracking-[0.16em] text-[#5f5f5f] uppercase">
                YÖNETİM
              </span>
            </div>

            {/* Yönetim ikonları */}
            <div className="pt-5 grid grid-cols-3 gap-y-6 place-items-center">
              <button
                onClick={() => navigate("/admin/branches")}
                className="flex flex-col items-center active:scale-[0.97] transition"
              >
                <div className={circleBase}>
                  <span className="text-2xl text-[#6a1b9a]">🏢</span>
                </div>
                <span className={circleLabel}>
                  ŞUBE
                  <br />
                  YÖNETİMİ
                </span>
              </button>

              <button
                onClick={() => navigate("/admin-management")}
                className="flex flex-col items-center active:scale-[0.97] transition"
              >
                <div className={circleBase}>
                  <span className="text-2xl text-[#6a1b9a]">👥</span>
                </div>
                <span className={circleLabel}>
                  KULLANICI
                  <br />
                  YÖNETİMİ
                </span>
              </button>

              <button
                onClick={() => navigate("/admin/products")}
                className="flex flex-col items-center active:scale-[0.97] transition"
              >
                <div className={circleBase}>
                  <span className="text-2xl text-[#6a1b9a]">🍔</span>
                </div>
                <span className={circleLabel}>
                  ÜRÜN
                  <br />
                  YÖNETİMİ
                </span>
              </button>
            </div>
          </>
        )}

        {/* Finansal başlığı */}
        <div className="mt-4 -mx-6 bg-[#e8e8e8] h-8 flex items-center justify-center shadow-sm">
          <span className="text-[11px] font-semibold tracking-[0.16em] text-[#5f5f5f] uppercase">
            FİNANSAL
          </span>
        </div>

        {/* Finansal ikonlar */}
        <div className="pt-5 grid grid-cols-2 gap-y-6 place-items-center">
          <button
            onClick={() => navigate("/bank-status")}
            className="flex flex-col items-center active:scale-[0.97] transition"
          >
            <div className={circleBase}>
              <span className="text-2xl text-[#6a1b9a]">💳</span>
            </div>
            <span className={circleLabel}>
              BANKA
              <br />
              DURUMU
            </span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => navigate("/monthly-reports")}
              className="flex flex-col items-center active:scale-[0.97] transition"
            >
              <div className={circleBase}>
                <span className="text-2xl text-[#6a1b9a]">📅</span>
              </div>
              <span className={circleLabel}>
                AYLIK
                <br />
                RAPORLAMA
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Alt bilgi ve çıkış */}
      <div className="bg-[#e8e8e8] px-5 py-4 flex items-center justify-between mt-auto">
        <div>
          <div className="text-[13px] font-extrabold text-[#8e24aa] uppercase">
            {user?.name || "KULLANICI"}
          </div>
          <div className="text-[10px] text-[#5f5f5f] mt-1">{roleLabel}</div>
        </div>
        <button
          onClick={handleLogout}
          className="text-[12px] font-semibold text-[#e53935] uppercase tracking-wide"
        >
          ÇIKIŞ
        </button>
      </div>
    </div>
  );
};
