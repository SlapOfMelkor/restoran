import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiClient } from "../../api/client";

interface Branch {
  id: number;
  name: string;
  address: string;
  phone?: string;
}

interface MobileLayoutProps {
  children: React.ReactNode;
}

export const MobileLayout: React.FC<MobileLayoutProps> = ({ children }) => {
  const { user, logout, selectedBranchId, setSelectedBranchId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  const getPageTitle = () => {
    switch (location.pathname) {
      case "/cash":
        return "Günlük Para Girişi";
      case "/stock":
        return "Stok Güncelleme";
      case "/center-shipments":
        return "Sevkiyatlar";
      case "/shipments":
        return "Sevkiyatlar";
      case "/expenses":
        return "Gider Yönetimi";
      case "/financial-summary":
        return "Finansal Özet";
      case "/admin-management":
        return "Kullanıcı Yönetimi";
      case "/admin/branches":
        return "Şube Yönetimi";
      case "/admin/products":
        return "Ürün Yönetimi";
      case "/bank-status":
        return "Banka Durumu";
      case "/monthly-reports":
        return "Aylık Raporlama";
      case "/waste":
        return "Zayiat Yönetimi";
      case "/produce":
        return "Manav Yönetimi";
      default:
        return "İşlem Ekranı";
    }
  };

  const pageTitle = getPageTitle();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  useEffect(() => {
    if (user?.role === "super_admin") {
      setLoadingBranches(true);
      apiClient
        .get("/admin/branches")
        .then((res) => {
          setBranches(res.data);
        })
        .catch((err) => {
          console.error("Şubeler yüklenemedi:", err);
        })
        .finally(() => {
          setLoadingBranches(false);
        });
    }
  }, [user?.role]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const branchId = e.target.value ? parseInt(e.target.value, 10) : null;
    setSelectedBranchId(branchId);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[#BDB8B8] to-[#E3D6EB] text-black">
      {/* Üst Bar - Ana menü hariç tüm sayfalarda */}
      {!isHome && (
        <header className="h-14 flex items-center justify-between px-4 border-b border-[#E5E5E5] bg-[#E5E5E5]/90 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-full bg-[#F4F4F4] border border-[#E5E5E5] text-[#8F1A9F] hover:bg-[#e6e6e6] transition-colors"
              aria-label="Ana menüye dön"
            >
              <span className="text-lg leading-none">←</span>
            </button>
            <div className="text-base font-semibold leading-tight text-[#8F1A9F]">
              {pageTitle}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user?.role === "super_admin" && (
              <div className="hidden xs:flex items-center gap-2 px-3 py-1.5 bg-white/70 rounded-lg border border-[#E5E5E5]">
                <span className="text-[11px] font-semibold text-[#8F1A9F]">🏢 Şube</span>
                <select
                  value={selectedBranchId || ""}
                  onChange={handleBranchChange}
                  className="bg-transparent border-0 text-xs font-medium text-[#8F1A9F] focus:outline-none focus:ring-0 cursor-pointer"
                  disabled={loadingBranches}
                >
                  <option value="">Tüm Şubeler</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={handleLogout}
              className="text-[11px] text-[#FF0000] hover:text-red-600 underline-offset-2 hover:underline"
            >
              Çıkış
            </button>
          </div>
        </header>
      )}

      {/* İçerik */}
      <main className="flex-1 px-4 py-4 overflow-y-auto">
        {isHome && user?.role === "super_admin" && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-white/70 rounded-lg border border-[#E5E5E5] w-full max-w-xs">
            <span className="text-[11px] font-semibold text-[#8F1A9F]">🏢 Şube</span>
            <select
              value={selectedBranchId || ""}
              onChange={handleBranchChange}
              className="flex-1 bg-transparent border-0 text-xs font-medium text-[#8F1A9F] focus:outline-none focus:ring-0 cursor-pointer"
              disabled={loadingBranches}
            >
              <option value="">Tüm Şubeler</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            {loadingBranches && (
              <span className="text-[10px] text-slate-500 whitespace-nowrap">Yükleniyor...</span>
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
};


