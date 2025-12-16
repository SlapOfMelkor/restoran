import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

interface Branch {
  id: number;
  name: string;
  address: string;
}

interface BranchAdmin {
  id: number;
  name: string;
  email: string;
  role: string;
  branch_id: number | null;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

interface AdminActivity {
  id: number;
  created_at: string;
  entity_type: string;
  entity_id: number;
  action: "create" | "update" | "delete" | "undo";
  description: string;
  is_undone: boolean;
}

export const AdminManagementPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [admins, setAdmins] = useState<BranchAdmin[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<BranchAdmin | null>(null);
  const [activities, setActivities] = useState<AdminActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [activityYear, setActivityYear] = useState(new Date().getFullYear());
  const [activityMonth, setActivityMonth] = useState(new Date().getMonth() + 1);
  const [createFormData, setCreateFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newlyCreatedAdmin, setNewlyCreatedAdmin] = useState<{
    id: number;
    name: string;
    email: string;
    password: string;
  } | null>(null);

  useEffect(() => {
    if (user?.role === "super_admin") {
      fetchBranches();
    }
  }, [user?.role]);

  useEffect(() => {
    if (selectedBranchId) {
      fetchAdmins();
    } else {
      setAdmins([]);
    }
  }, [selectedBranchId]);

  useEffect(() => {
    if (selectedAdmin && showPopup) {
      fetchAdminActivities();
    }
  }, [selectedAdmin, showPopup, filterType, activityYear, activityMonth, selectedBranchId]);

  const fetchBranches = async () => {
    try {
      const res = await apiClient.get("/admin/branches");
      setBranches(res.data);
    } catch (err) {
      console.error("Şubeler yüklenemedi:", err);
    }
  };

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  const fetchAdmins = async () => {
    if (!selectedBranchId) return;

    setLoading(true);
    try {
      const res = await apiClient.get(`/admin/branches/${selectedBranchId}/admins`);
      setAdmins(res.data);
    } catch (err) {
      console.error("Adminler yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminActivities = async () => {
    if (!selectedAdmin || !selectedBranchId) return;

    setLoading(true);
    try {
      const params: any = {
        user_id: selectedAdmin.id,
        branch_id: selectedBranchId,
      };

      if (filterType !== "all") {
        params.entity_type = filterType;
      }

      const res = await apiClient.get("/audit-logs", { params });

      // Ay filtresi uygula
      const filtered = res.data.filter((log: AdminActivity) => {
        const logDate = new Date(log.created_at);
        return (
          logDate.getFullYear() === activityYear &&
          logDate.getMonth() + 1 === activityMonth
        );
      });

      setActivities(filtered);
    } catch (err) {
      console.error("İşlemler yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminClick = (admin: BranchAdmin) => {
    setSelectedAdmin(admin);
    setShowPopup(true);
  };

  const getEntityTypeLabel = (type: string) => {
    switch (type) {
      case "expense":
        return "Gider";
      case "cash_movement":
        return "Para Girişi";
      case "center_shipment":
        return "Sevkiyat";
      case "stock_snapshot":
        return "Stok Snapshot";
      default:
        return type;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "create":
        return "Eklendi";
      case "update":
        return "Güncellendi";
      case "delete":
        return "Silindi";
      case "undo":
        return "Geri Alındı";
      default:
        return action;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "create":
        return "text-green-400";
      case "update":
        return "text-blue-400";
      case "delete":
        return "text-red-400";
      case "undo":
        return "text-yellow-400";
      default:
        return "text-[#222222]";
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId) {
      alert("Lütfen önce bir şube seçin");
      return;
    }

    if (!createFormData.name || !createFormData.email || !createFormData.password) {
      alert("Lütfen tüm alanları doldurun");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post(`/admin/branches/${selectedBranchId}/admin`, {
        name: createFormData.name,
        email: createFormData.email,
        password: createFormData.password,
      });
      
      // Yeni oluşturulan admin bilgilerini kaydet (şifre dahil - sadece bir kez gösterilecek)
      setNewlyCreatedAdmin({
        id: res.data.id,
        name: res.data.name,
        email: res.data.email,
        password: res.data.password, // Backend'den dönen şifre (sadece oluşturma sırasında)
      });
      
      setCreateFormData({ name: "", email: "", password: "" });
      setShowCreateForm(false);
      fetchAdmins();
    } catch (err: any) {
      alert(err.response?.data?.error || "Admin oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  if (user?.role !== "super_admin") {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Yetkisiz Erişim</h1>
        <p className="text-xs text-[#222222]">Bu sayfaya sadece super admin erişebilir.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-[#222222]">
          Şube yöneticilerini görüntüleyin ve işlemlerini inceleyin
        </p>
        {!selectedBranchId && (
          <div className="mt-3 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
            <p className="text-xs text-yellow-400">
              ⚠️ Lütfen üst kısımdaki header'dan bir şube seçin
            </p>
          </div>
        )}
        {selectedBranchId && selectedBranch && (
          <div className="mt-3 p-3 bg-emerald-900/30 border border-emerald-700/50 rounded-lg">
            <p className="text-xs text-emerald-400">
              📍 Seçili Şube: <span className="font-semibold">{selectedBranch.name}</span>
            </p>
          </div>
        )}
      </div>

      {selectedBranchId ? (
        <div className="space-y-4">
          <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">
                {selectedBranch?.name} - Adminler
              </h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-4 py-2 rounded-lg text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
              >
                {showCreateForm ? "Formu Gizle" : "Yeni Admin Ekle"}
              </button>
            </div>

            {showCreateForm && (
              <div className="mb-4 p-4 bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] shadow-sm">
                <h3 className="text-xs font-semibold mb-3">Yeni Admin Oluştur</h3>
                <form onSubmit={handleCreateAdmin} className="space-y-3">
                  <div>
                    <label className="block text-xs text-[#555555] mb-1">
                      İsim
                    </label>
                    <input
                      type="text"
                      value={createFormData.name}
                      onChange={(e) =>
                        setCreateFormData({ ...createFormData, name: e.target.value })
                      }
                      className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#555555] mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={createFormData.email}
                      onChange={(e) =>
                        setCreateFormData({ ...createFormData, email: e.target.value })
                      }
                      className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#555555] mb-1">
                      Şifre
                    </label>
                    <input
                      type="password"
                      value={createFormData.password}
                      onChange={(e) =>
                        setCreateFormData({
                          ...createFormData,
                          password: e.target.value,
                        })
                      }
                      className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 rounded text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
                    >
                      {submitting ? "Oluşturuluyor..." : "Oluştur"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCreateForm(false);
                        setCreateFormData({ name: "", email: "", password: "" });
                      }}
                      className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
                    >
                      İptal
                    </button>
                  </div>
                </form>
              </div>
            )}

            {loading ? (
              <p className="text-xs text-[#222222]">Yükleniyor...</p>
            ) : admins.length === 0 ? (
              <p className="text-xs text-[#222222]">Bu şubede admin yok</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {admins.map((admin) => (
                  <div
                    key={admin.id}
                    onClick={() => handleAdminClick(admin)}
                    className="p-4 bg-white rounded-xl border border-[#E5E5E5] hover:border-[#8F1A9F] cursor-pointer transition-colors shadow-sm"
                  >
                    <div className="text-sm font-semibold">{admin.name}</div>
                    <div className="text-xs text-[#222222] mt-1">{admin.email}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Kayıt: {new Date(admin.created_at).toLocaleDateString("tr-TR")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <p className="text-xs text-[#222222]">
            Lütfen bir şube seçin
          </p>
        </div>
      )}

      {/* Popup Modal */}
      {showPopup && selectedAdmin ? (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{selectedAdmin.name}</h2>
                <p className="text-xs text-[#222222]">{selectedAdmin.email}</p>
              </div>
              <button
                onClick={() => {
                  setShowPopup(false);
                  setSelectedAdmin(null);
                  setShowPassword(false);
                }}
                className="text-[#555555] hover:text-black text-xl"
              >
                ×
              </button>
            </div>

            {/* Admin Bilgileri */}
            <div className="p-4 border-b border-[#E5E5E5] bg-[#F4F4F4]">
              <h3 className="text-sm font-semibold mb-3">Kullanıcı Bilgileri</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="text-[#222222]">ID:</label>
                  <div className="text-slate-200 font-mono">{selectedAdmin.id}</div>
                </div>
                <div>
                  <label className="text-[#222222]">Rol:</label>
                  <div className="text-slate-200">{selectedAdmin.role}</div>
                </div>
                <div>
                  <label className="text-[#222222]">Email:</label>
                  <div className="text-slate-200">{selectedAdmin.email}</div>
                </div>
                <div>
                  <label className="text-[#222222]">Şube ID:</label>
                  <div className="text-slate-200">{selectedAdmin.branch_id || "Yok"}</div>
                </div>
                <div>
                  <label className="text-[#222222]">Oluşturulma:</label>
                  <div className="text-slate-200">
                    {new Date(selectedAdmin.created_at).toLocaleString("tr-TR")}
                  </div>
                </div>
                <div>
                  <label className="text-[#222222]">Son Güncelleme:</label>
                  <div className="text-slate-200">
                    {new Date(selectedAdmin.updated_at).toLocaleString("tr-TR")}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-[#222222] block mb-1">Şifre Hash:</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white border border-[#E5E5E5] rounded px-3 py-2 font-mono text-xs text-[#444444] break-all">
                      {showPassword ? selectedAdmin.password_hash : "••••••••••••••••"}
                    </div>
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs transition-colors whitespace-nowrap"
                    >
                      {showPassword ? "Gizle" : "Görüntüle"}
                    </button>
                  </div>
                  <p className="text-slate-500 text-xs mt-1">
                    ⚠️ Not: Şifreler güvenlik nedeniyle hash'lenmiş olarak saklanır ve geri dönüştürülemez.
                    <br />
                    Mevcut adminlerin şifrelerini göremeyiz. Yeni admin oluştururken şifre bir kez gösterilir.
                  </p>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="p-4 border-b border-slate-800 space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[#222222]">İşlem Tipi:</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="bg-white border border-[#E5E5E5] rounded px-3 py-1.5 text-xs text-[#000000]"
                  >
                    <option value="all">Tümü</option>
                    <option value="expense">Giderler</option>
                    <option value="cash_movement">Para Girişleri</option>
                    <option value="center_shipment">Sevkiyatlar</option>
                    <option value="stock_snapshot">Stok Snapshot'ları</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[#222222]">Ay:</label>
                  <input
                    type="number"
                    value={activityYear}
                    onChange={(e) =>
                      setActivityYear(parseInt(e.target.value) || new Date().getFullYear())
                    }
                    className="w-20 bg-white border border-[#E5E5E5] rounded px-2 py-1.5 text-xs text-[#000000]"
                    placeholder="Yıl"
                  />
                  <select
                    value={activityMonth}
                    onChange={(e) =>
                      setActivityMonth(parseInt(e.target.value) || 1)
                    }
                    className="bg-white border border-[#E5E5E5] rounded px-2 py-1.5 text-xs text-[#000000]"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Activities List */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <p className="text-xs text-[#222222]">Yükleniyor...</p>
              ) : activities.length === 0 ? (
                <p className="text-xs text-[#222222]">
                  Bu ay için işlem kaydı yok
                </p>
              ) : (
                <div className="space-y-2">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="p-3 bg-white rounded-xl border border-[#E5E5E5]"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span className={getActionColor(activity.action)}>
                          {getActionLabel(activity.action)}
                        </span>
                        <span className="text-[#222222]">•</span>
                        <span className="text-slate-300">
                          {getEntityTypeLabel(activity.entity_type)}
                        </span>
                        <span className="text-[#222222]">•</span>
                        <span className="text-[#222222]">
                          {activity.description}
                        </span>
                        <span className="text-[#222222]">•</span>
                        <span className="text-slate-500">
                          {new Date(activity.created_at).toLocaleString("tr-TR")}
                        </span>
                        {activity.is_undone && (
                          <>
                            <span className="text-[#222222]">•</span>
                            <span className="text-yellow-400">Geri Alındı</span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 text-xs text-[#222222]">
              Toplam {activities.length} işlem
            </div>
          </div>
        </div>
      ) : null}

      {/* Yeni Oluşturulan Admin Bilgileri Modal */}
      {newlyCreatedAdmin && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] w-full max-w-md shadow-xl">
            <div className="p-4 border-b border-[#E5E5E5] flex items-center justify-between">
              <h3 className="text-lg font-semibold">Admin Oluşturuldu</h3>
              <button
                onClick={() => setNewlyCreatedAdmin(null)}
                className="text-slate-500 hover:text-slate-800 text-xl"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-[#E3D6EB] border border-[#C9B2D6] rounded-lg p-3">
                <p className="text-xs text-[#8F1A9F] mb-2">
                  ⚠️ Bu bilgileri kaydedin! Şifre sadece burada gösterilir.
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <label className="text-[#222222] text-xs">İsim:</label>
                  <div className="text-slate-200 font-semibold">{newlyCreatedAdmin.name}</div>
                </div>
                <div>
                  <label className="text-[#222222] text-xs">Email:</label>
                  <div className="text-slate-200 font-semibold">{newlyCreatedAdmin.email}</div>
                </div>
                <div>
                  <label className="text-[#222222] text-xs">Şifre:</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-white border border-[#E5E5E5] rounded px-3 py-2 font-mono text-sm text-[#000000]">
                      {newlyCreatedAdmin.password}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(newlyCreatedAdmin.password);
                        alert("Şifre kopyalandı!");
                      }}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-xs transition-colors"
                    >
                      Kopyala
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setNewlyCreatedAdmin(null)}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors mt-4"
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

