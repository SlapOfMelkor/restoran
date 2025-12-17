import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

interface Product {
  id: number;
  name: string;
  unit: string;
}

interface WasteEntry {
  id: number;
  branch_id: number;
  product_id: number;
  product_name: string;
  date: string;
  quantity: number;
  note: string;
  created_at: string;
}

interface WasteEntryWithLog extends WasteEntry {
  created_by_user_id?: number;
  created_by_user_name?: string;
  log_id?: number;
  is_undone?: boolean;
}

export const WastePage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [wasteEntries, setWasteEntries] = useState<WasteEntryWithLog[]>([]);
  const [showForm, setShowForm] = useState(true);
  const [showEntries, setShowEntries] = useState(true);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    product_id: "",
    quantity: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchWasteEntries();
  }, [user, selectedBranchId]);

  const fetchProducts = async () => {
    try {
      const res = await apiClient.get("/products");
      setProducts(res.data);
    } catch (err) {
      console.error("Ürünler yüklenemedi:", err);
    }
  };

  const fetchWasteEntries = async () => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const entriesRes = await apiClient.get("/waste-entries", { params });

      // Audit log'ları çek
      const logParams: any = {
        entity_type: "waste_entry",
      };
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          logParams.branch_id = selectedBranchId;
        }
      } else if (user?.role === "branch_admin" && user.branch_id) {
        logParams.branch_id = user.branch_id;
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });

      // Entries'i log'larla birleştir
      const entriesWithLogs: WasteEntryWithLog[] = entriesRes.data.map((entry: WasteEntry) => {
        const createLog = logsRes.data.find(
          (log: any) =>
            log.entity_type === "waste_entry" &&
            log.entity_id === entry.id &&
            log.action === "create"
        );

        return {
          ...entry,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });

      setWasteEntries(entriesWithLogs);
    } catch (err) {
      console.error("Zayiat girişleri yüklenemedi:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.product_id || formData.product_id === "") {
      alert("Lütfen bir ürün seçin");
      return;
    }

    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      alert("Lütfen geçerli bir miktar girin");
      return;
    }

    if (!formData.note || formData.note.trim().length < 3) {
      alert("Lütfen not alanını doldurun (hangi garson/mutfakçı sebep oldu - en az 3 karakter)");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        date: formData.date,
        product_id: parseInt(formData.product_id),
        quantity: parseFloat(formData.quantity),
        note: formData.note.trim(),
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/waste-entries", payload);
      alert("Zayiat girişi başarıyla kaydedildi");

      // Formu temizle
      setFormData({
        date: new Date().toISOString().split("T")[0],
        product_id: "",
        quantity: "",
        note: "",
      });

      fetchWasteEntries();
    } catch (err: any) {
      alert(err.response?.data?.error || "Zayiat girişi kaydedilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async (logId: number, _entryId: number) => {
    if (!confirm("Bu işlemi geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("İşlem başarıyla geri alındı");
      fetchWasteEntries();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const handleDelete = async (entryId: number) => {
    if (!confirm("Bu zayiat girişini silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.delete(`/waste-entries/${entryId}`);
      alert("Zayiat girişi başarıyla silindi");
      fetchWasteEntries();
    } catch (err: any) {
      alert(err.response?.data?.error || "Zayiat girişi silinemedi");
    }
  };

  const canUndo = (entry: WasteEntryWithLog): boolean => {
    if (!entry.log_id || entry.is_undone) {
      return false;
    }
    if (user?.role === "super_admin") {
      return true;
    }
    return entry.created_by_user_id === user?.id;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#222222]">
          Günlük zayiat girişlerini kaydedin ve geçmişi yönetin
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
          >
            {showForm ? "Formu Gizle" : "Zayiat Ekle"}
          </button>
          <button
            onClick={() => setShowEntries(!showEntries)}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
          >
            {showEntries ? "Geçmişi Gizle" : "Geçmişi Göster"}
          </button>
        </div>
      </div>

      {/* Zayiat Ekleme Formu */}
      {showForm && (
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Yeni Zayiat Girişi</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#222222] mb-1">Tarih</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-[#222222] mb-1">
                  Ürün <span className="text-red-400">*</span>
                </label>
                <select
                  value={formData.product_id}
                  onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  required
                >
                  <option value="">Ürün Seçin...</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#222222] mb-1">
                  Miktar <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#222222] mb-1">
                Not (Hangi garson/mutfakçı sebep oldu) <span className="text-red-400">*</span>
              </label>
              <textarea
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                rows={3}
                placeholder="Örn: Garson Ahmet yanlışlıkla döktü..."
                required
                minLength={3}
              />
              <p className="text-xs text-slate-500 mt-1">
                Bu alan zorunludur. Hangi garson veya mutfakçının sebep olduğunu belirtin.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
              >
                {submitting ? "Kaydediliyor..." : "Zayiat Girişini Kaydet"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormData({
                    date: new Date().toISOString().split("T")[0],
                    product_id: "",
                    quantity: "",
                    note: "",
                  });
                }}
                className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
              >
                Temizle
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Zayiat Girişleri Geçmişi */}
      {showEntries && (
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Zayiat Girişleri Geçmişi</h2>
          {wasteEntries.length === 0 ? (
            <p className="text-xs text-[#222222]">Henüz zayiat girişi yok</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {wasteEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`p-3 bg-white rounded-xl border ${
                    entry.is_undone ? "border-[#CCCCCC] opacity-60" : "border-[#E5E5E5]"
                  } shadow-sm`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">
                          {entry.product_name}
                        </span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs text-[#222222]">
                          {entry.date}
                        </span>
                        {entry.created_by_user_name && (
                          <>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-slate-300">
                              👤 {entry.created_by_user_name}
                            </span>
                          </>
                        )}
                        {entry.is_undone && (
                          <>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-yellow-400">
                              (Geri Alındı)
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-[#222222] mb-1">
                        Miktar: {entry.quantity.toFixed(2)}
                      </div>
                      <div className="text-xs text-slate-600 bg-[#F4F4F4] p-2 rounded mt-1 border border-[#E5E5E5]">
                        <span className="font-semibold">Not:</span> {entry.note}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-slate-500">
                        {new Date(entry.created_at).toLocaleDateString("tr-TR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      {entry.log_id && canUndo(entry) && (
                        <button
                          onClick={() => handleUndo(entry.log_id!, entry.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors whitespace-nowrap"
                        >
                          Geri Al
                        </button>
                      )}
                      {!entry.is_undone && (
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="px-3 py-1.5 bg-red-800 hover:bg-red-900 rounded text-xs transition-colors whitespace-nowrap"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

