import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

interface Branch {
  id: number;
  name: string;
  address: string;
  phone: string;
  created_at: string;
}

export const BranchesPage: React.FC = () => {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    phone: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.role === "super_admin") {
      fetchBranches();
    }
  }, [user?.role]);

  const fetchBranches = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/admin/branches");
      setBranches(res.data);
    } catch (err) {
      console.error("Şubeler yüklenemedi:", err);
      alert("Şubeler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert("Şube adı zorunludur");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        name: formData.name.trim(),
        address: formData.address.trim(),
      };
      if (formData.phone.trim()) {
        payload.phone = formData.phone.trim();
      }

      await apiClient.post("/admin/branches", payload);
      alert("Şube başarıyla oluşturuldu");
      setFormData({ name: "", address: "", phone: "" });
      setShowCreateForm(false);
      fetchBranches();
    } catch (err: any) {
      alert(err.response?.data?.error || "Şube oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      address: branch.address,
      phone: branch.phone || "",
    });
    setShowEditForm(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;
    if (!formData.name.trim()) {
      alert("Şube adı zorunludur");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        name: formData.name.trim(),
        address: formData.address.trim(),
      };
      if (formData.phone.trim()) {
        payload.phone = formData.phone.trim();
      } else {
        payload.phone = null;
      }

      await apiClient.put(`/admin/branches/${editingBranch.id}`, payload);
      alert("Şube başarıyla güncellendi");
      setShowEditForm(false);
      setEditingBranch(null);
      setFormData({ name: "", address: "", phone: "" });
      fetchBranches();
    } catch (err: any) {
      alert(err.response?.data?.error || "Şube güncellenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Bu şubeyi silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.delete(`/admin/branches/${id}`);
      alert("Şube başarıyla silindi");
      fetchBranches();
    } catch (err: any) {
      alert(err.response?.data?.error || "Şube silinemedi");
    }
  };

  const resetForm = () => {
    setFormData({ name: "", address: "", phone: "" });
    setShowCreateForm(false);
    setShowEditForm(false);
    setEditingBranch(null);
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
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#222222]">
          Şubeleri görüntüleyin, oluşturun, düzenleyin veya silin
        </p>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 rounded-lg text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
        >
          {showCreateForm ? "Formu Gizle" : "Yeni Şube Ekle"}
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Yeni Şube Oluştur</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Şube Adı <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                required
                placeholder="Örn: Kadıköy Şubesi"
              />
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Adres
              </label>
              <textarea
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                rows={2}
                placeholder="Şube adresi..."
              />
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Telefon
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="Örn: 0212 123 45 67"
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
                onClick={resetForm}
                className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Form */}
      {showEditForm && editingBranch && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Şube Düzenle</h2>
          <form onSubmit={handleUpdate} className="space-y-3">
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Şube Adı <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Adres
              </label>
              <textarea
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Telefon
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="Örn: 0212 123 45 67"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
              >
                {submitting ? "Güncelleniyor..." : "Güncelle"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Branches List */}
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-3 text-[#8F1A9F]">Şubeler</h2>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : branches.length === 0 ? (
          <p className="text-xs text-[#222222]">Henüz şube eklenmemiş</p>
        ) : (
          <div className="space-y-2">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className="p-4 bg-white rounded-xl border border-[#E5E5E5] flex items-center justify-between shadow-sm"
              >
                <div className="flex-1">
                  <div className="text-sm font-semibold">{branch.name}</div>
                  {branch.address && (
                    <div className="text-xs text-[#222222] mt-1">
                      📍 {branch.address}
                    </div>
                  )}
                  {branch.phone && (
                    <div className="text-xs text-[#222222] mt-1">
                      📞 {branch.phone}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 mt-1">
                    Oluşturulma:{" "}
                    {new Date(branch.created_at).toLocaleDateString("tr-TR")}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(branch)}
                    className="px-3 py-1.5 bg-[#8F1A9F] hover:bg-[#7a168c] rounded text-xs transition-colors text-white"
                  >
                    Düzenle
                  </button>
                  <button
                    onClick={() => handleDelete(branch.id)}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

