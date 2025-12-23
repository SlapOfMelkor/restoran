import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";
import { Modal } from "../components/Modal";

interface CashMovement {
  id: number;
  branch_id: number;
  date: string;
  method: "cash" | "pos" | "yemeksepeti";
  amount: number;
  description: string;
}

interface CashMovementWithLog extends CashMovement {
  created_by_user_id?: number;
  created_by_user_name?: string;
  created_at?: string;
  log_id?: number;
  is_undone?: boolean;
}

interface AuditLog {
  id: number;
  created_at: string;
  branch_id: number | null;
  user_id: number;
  user_name: string;
  entity_type: string;
  entity_id: number;
  action: "create" | "update" | "delete" | "undo";
  description: string;
  is_undone: boolean;
  undone_by: number | null;
  undone_at: string | null;
}

export const CashPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [movements, setMovements] = useState<CashMovementWithLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    method: "cash" as "cash" | "pos" | "yemeksepeti",
    amount: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [dateFilter, setDateFilter] = useState<string>("");

  const fetchMovements = async () => {
    setLoading(true);
    try {
      const params: any = {};
      // Super admin için branch_id seçilmişse filtrele
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          params.branch_id = selectedBranchId;
        } else {
          // Branch seçilmediyse hiçbir şey gösterme
          setMovements([]);
          setLoading(false);
          return;
        }
      }
      const movementsRes = await apiClient.get("/cash-movements", { params });
      
      // Audit log'ları çek
      const logParams: any = {
        entity_type: "cash_movement",
      };
      // Super admin için branch_id seçilmişse filtrele, yoksa tüm şubeler için çek
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          logParams.branch_id = selectedBranchId;
        }
        // branch_id yoksa tüm şubeler için log'lar çekilir (filtre yok)
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });
      
      // Cash movement'ları log'larla birleştir
      const movementsWithLogs: CashMovementWithLog[] = movementsRes.data.map((mov: CashMovement) => {
        // Bu movement için create log'unu bul
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "cash_movement" &&
            log.entity_id === mov.id &&
            log.action === "create"
        );
        
        return {
          ...mov,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          created_at: createLog?.created_at,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });
      
      setMovements(movementsWithLogs);
    } catch (err) {
      console.error("Ciro kayıtları yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovements();
  }, [user, selectedBranchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(formData.amount);
    
    if (!formData.amount || isNaN(amountNum) || amountNum <= 0) {
      alert("Lütfen geçerli bir tutar girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        method: formData.method,
        amount: amountNum,
        description: formData.description,
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/cash-movements", payload);
      alert("Para girişi başarıyla eklendi");
      setShowForm(false);
      setFormData({ method: "cash", amount: "", description: "" });
      await fetchMovements();
    } catch (err: any) {
      alert(err.response?.data?.error || "Para girişi eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async (logId: number, _movementId: number) => {
    if (!confirm("Bu işlemi geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("İşlem başarıyla geri alındı");
      fetchMovements();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const canUndo = (movement: CashMovementWithLog): boolean => {
    if (!movement.log_id || movement.is_undone) {
      return false;
    }
    // Super admin her şeyi geri alabilir
    if (user?.role === "super_admin") {
      return true;
    }
    // Branch admin kendi şubesindeki tüm kayıtları geri alabilir
    if (user?.role === "branch_admin" && user.branch_id) {
      return movement.branch_id === user.branch_id;
    }
    return false;
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case "cash":
        return "Nakit";
      case "pos":
        return "POS";
      case "yemeksepeti":
        return "Yemeksepeti";
      default:
        return method;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center py-8">
        <button
          onClick={() => setShowForm(true)}
          className="px-8 py-4 rounded-xl text-base font-semibold transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white shadow-lg hover:shadow-xl min-w-[200px] max-w-[250px] whitespace-normal text-center break-words"
        >
          Para Girişi Ekle
        </button>
      </div>

      <Modal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setFormData({
            method: "cash",
            amount: "",
            description: "",
          });
        }}
        title="Yeni Para Girişi"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Para Giriş Türü
              </label>
              <select
                value={formData.method}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    method: e.target.value as "cash" | "pos" | "yemeksepeti",
                  })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                required
              >
                <option value="cash">Nakit</option>
                <option value="pos">POS</option>
                <option value="yemeksepeti">Yemeksepeti</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Tutar (TL)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Açıklama (Opsiyonel)
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="Açıklama..."
              />
            </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
            >
              {submitting ? "Ekleniyor..." : "Ekle"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setFormData({ method: "cash", amount: "", description: "" });
              }}
              className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
            >
              İptal
            </button>
          </div>
        </form>
      </Modal>

      <div className="bg-white/80 rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#8F1A9F]">Para Girişi Kayıtları</h2>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-white border border-[#E5E5E5] rounded px-3 py-1.5 text-xs text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter("")}
                className="px-2 py-1.5 bg-slate-500 hover:bg-slate-600 rounded text-xs text-white transition-colors"
              >
                Temizle
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : movements.length === 0 ? (
          <p className="text-xs text-[#222222]">Henüz para girişi kaydı bulunmamaktadır</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {(dateFilter
              ? movements.filter(m => m.date === dateFilter)
              : movements
            ).map((movement) => (
              <div
                key={movement.id}
                className={`p-3 bg-white rounded-xl border ${
                  movement.is_undone
                    ? "border-[#CCCCCC] opacity-60"
                    : "border-[#E5E5E5]"
                } shadow-sm hover:shadow-md transition-shadow`}
              >
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${
                      movement.method === "cash" 
                        ? "bg-green-100 text-green-700"
                        : movement.method === "pos"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-orange-100 text-orange-700"
                    }`}>
                      {getMethodLabel(movement.method)}
                    </span>
                    {movement.is_undone && (
                      <span className="text-xs text-yellow-400">
                        (Geri Alındı)
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-bold text-[#8F1A9F] mb-2">
                    {movement.amount.toFixed(2)} TL
                  </div>
                  <div className="text-xs text-[#555555] mb-1">
                    {movement.date}
                  </div>
                  {movement.created_by_user_name && (
                    <div className="text-xs text-[#777777] mb-2">
                      👤 {movement.created_by_user_name}
                    </div>
                  )}
                  {movement.description && (
                    <div className="text-xs text-[#222222] mb-2 line-clamp-2">
                      {movement.description}
                    </div>
                  )}
                  <div className="mt-auto pt-2">
                    {movement.log_id && canUndo(movement) && (
                      <button
                        onClick={() =>
                          handleUndo(movement.log_id!, movement.id)
                        }
                        className="w-full px-2 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors text-white"
                      >
                        Geri Al
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
