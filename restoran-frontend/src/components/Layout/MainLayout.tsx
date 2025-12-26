import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiClient } from "../../api/client";

const navItemClass =
  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors";
const navItemActiveClass = "bg-slate-800 text-emerald-400";

interface Branch {
  id: number;
  name: string;
  address: string;
  phone?: string;
}

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, selectedBranchId, setSelectedBranchId } = useAuth();
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("sidebarOpen");
    return saved === "true";
  });

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

  // Sidebar durumu kalıcı kalsın
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebarOpen", isSidebarOpen ? "true" : "false");
    }
  }, [isSidebarOpen]);

  const handleNavClick = () => {
    // Sadece mobilde menüden seçim yapıldığında kapat
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 bg-slate-900 border-r border-slate-800 flex flex-col transform transition-all duration-200 md:overflow-hidden ${
          isSidebarOpen
            ? "translate-x-0 w-64 md:w-64 md:translate-x-0"
            : "-translate-x-full w-64 md:w-0 md:-translate-x-full"
        }`}
      >
        <div className="px-4 py-4 border-b border-slate-800">
          <div className="text-xl font-bold text-emerald-400">Cadinin Evi</div>
          <div className="text-xs text-[#222222]">Restoran Yönetim Paneli</div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 text-slate-200">
          <NavLink
            to="/cash"
            className={({ isActive }) =>
              `${navItemClass} ${isActive ? navItemActiveClass : ""}`
            }
            onClick={handleNavClick}
          >
            💵 Günlük Para Girişi
          </NavLink>

          <NavLink
            to="/shipments"
            className={({ isActive }) =>
              `${navItemClass} ${isActive ? navItemActiveClass : ""}`
            }
            onClick={handleNavClick}
          >
            🚚 Sevkiyatlar
          </NavLink>

          <NavLink
            to="/stock"
            className={({ isActive }) =>
              `${navItemClass} ${isActive ? navItemActiveClass : ""}`
            }
            onClick={handleNavClick}
          >
            📦 Stok Güncelleme
          </NavLink>

          <NavLink
            to="/waste"
            className={({ isActive }) =>
              `${navItemClass} ${isActive ? navItemActiveClass : ""}`
            }
            onClick={handleNavClick}
          >
            🗑️ Zayiat
          </NavLink>

          <NavLink
            to="/expenses"
            className={({ isActive }) =>
              `${navItemClass} ${isActive ? navItemActiveClass : ""}`
            }
            onClick={handleNavClick}
          >
            🧾 Giderler
          </NavLink>

          <NavLink
            to="/trades"
            className={({ isActive }) =>
              `${navItemClass} ${isActive ? navItemActiveClass : ""}`
            }
            onClick={handleNavClick}
          >
            💼 Ticaret
          </NavLink>

          <NavLink
            to="/financial-summary"
            className={({ isActive }) =>
              `${navItemClass} ${isActive ? navItemActiveClass : ""}`
            }
            onClick={handleNavClick}
          >
            📊 Finansal Özet
          </NavLink>

          {user?.role === "super_admin" && (
            <>
              <div className="mt-4 mb-2 text-xs font-semibold uppercase text-slate-500">
                Yönetim
              </div>

              <NavLink
                to="/admin-management"
                className={({ isActive }) =>
                  `${navItemClass} ${isActive ? navItemActiveClass : ""}`
                }
                onClick={handleNavClick}
              >
                👥 Kullanıcı Yönetimi
              </NavLink>

              <NavLink
                to="/admin/branches"
                className={({ isActive }) =>
                  `${navItemClass} ${isActive ? navItemActiveClass : ""}`
                }
                onClick={handleNavClick}
              >
                🏢 Şube Yönetimi
              </NavLink>

              <NavLink
                to="/admin/products"
                className={({ isActive }) =>
                  `${navItemClass} ${isActive ? navItemActiveClass : ""}`
                }
                onClick={handleNavClick}
              >
                🍔 Ürün Yönetimi
              </NavLink>

              <NavLink
                to="/admin/expense-categories"
                className={({ isActive }) =>
                  `${navItemClass} ${isActive ? navItemActiveClass : ""}`
                }
                onClick={handleNavClick}
              >
                🧩 Gider Kategorileri
              </NavLink>
            </>
          )}

          <div className="mt-4 mb-2 text-xs font-semibold uppercase text-slate-500">
            Finansal
          </div>

          <NavLink
            to="/bank-status"
            className={({ isActive }) =>
              `${navItemClass} ${isActive ? navItemActiveClass : ""}`
            }
            onClick={handleNavClick}
          >
            🏦 Banka Durumu
          </NavLink>

          {user?.role === "super_admin" && (
            <NavLink
              to="/monthly-reports"
              className={({ isActive }) =>
                `${navItemClass} ${isActive ? navItemActiveClass : ""}`
              }
              onClick={handleNavClick}
            >
              📋 Aylık Raporlama
            </NavLink>
          )}
        </nav>

        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex flex-col">
            <span className="font-semibold truncate">
              {user?.name || "Kullanıcı"}
            </span>
            <span className="text-[#222222]">
              {user?.role === "super_admin" ? "Super Admin" : "Şube Admini"}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-red-400 hover:text-red-300 text-xs"
          >
            Çıkış
          </button>
        </div>
      </aside>

      {/* Mobil backdrop */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Content */}
      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b border-slate-800 flex items-center px-4 md:px-6 justify-between bg-slate-950/70 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              className="p-2 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 transition-colors"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              aria-label="Menüyü aç/kapat"
            >
              <div className="w-5 h-[2px] bg-slate-200 mb-1" />
              <div className="w-5 h-[2px] bg-slate-200 mb-1" />
              <div className="w-5 h-[2px] bg-slate-200" />
            </button>

            {user?.role === "super_admin" && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700">
                <span className="text-xs font-semibold text-slate-300">🏢 Şube:</span>
                <select
                  value={selectedBranchId || ""}
                  onChange={handleBranchChange}
                  className="bg-transparent border-0 text-sm font-medium text-slate-200 focus:outline-none focus:ring-0 cursor-pointer min-w-[150px]"
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
                  <span className="text-xs text-slate-500">Yükleniyor...</span>
                )}
                {selectedBranchId && !loadingBranches && (
                  <span className="ml-2 px-2 py-0.5 bg-emerald-600/20 text-emerald-400 text-xs rounded">
                    Aktif
                  </span>
                )}
              </div>
            )}
            {user?.role === "branch_admin" && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 rounded-lg border border-slate-700">
                <span className="text-xs font-semibold text-slate-300">🏢 Şube:</span>
                <span className="text-sm font-medium text-slate-200">
                  {user.branch?.name || "Bilinmiyor"}
                </span>
              </div>
            )}
          </div>
        </header>

        <div className="flex-1 p-4 md:p-6 bg-slate-950">{children}</div>
      </main>
    </div>
  );
};
