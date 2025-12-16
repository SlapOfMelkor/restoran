import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

interface Expense {
  id: number;
  branch_id: number;
  category_id: number;
  category: string;
  date: string;
  amount: number;
  description: string;
}

interface ExpenseWithLog extends Expense {
  created_by_user_id?: number;
  created_by_user_name?: string;
  created_at?: string;
  log_id?: number;
  is_undone?: boolean;
}

interface ExpenseCategory {
  id: number;
  name: string;
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

export const ExpensesPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseWithLog[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState({ name: "" });
  const [expenseFormData, setExpenseFormData] = useState({
    category_id: "",
    date: new Date().toISOString().split("T")[0],
    amount: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchCategories = async () => {
    try {
      const res = await apiClient.get("/expense-categories");
      setCategories(res.data);
    } catch (err) {
      console.error("Kategoriler yüklenemedi:", err);
    }
  };

  const fetchShipments = async () => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/shipments", { params });
      setShipments(res.data || []);
    } catch (err) {
      console.error("Sevkiyatlar yüklenemedi:", err);
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const expensesRes = await apiClient.get("/expenses", { params });
      
      // Audit log'ları çek
      const logParams: any = {
        entity_type: "expense",
      };
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          logParams.branch_id = selectedBranchId;
        }
        // branch_id yoksa tüm şubeler için log'lar çekilir (filtre yok)
      } else if (user?.role === "branch_admin" && user.branch_id) {
        // Branch admin için kendi branch_id'sini kullan
        logParams.branch_id = user.branch_id;
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });
      
      // Expenses'i log'larla birleştir
      const expensesWithLogs: ExpenseWithLog[] = expensesRes.data.map((exp: Expense) => {
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "expense" &&
            log.entity_id === exp.id &&
            log.action === "create"
        );
        
        return {
          ...exp,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          created_at: createLog?.created_at,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });
      
      setExpenses(expensesWithLogs);
    } catch (err) {
      console.error("Giderler yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchExpenses();
    fetchShipments();
  }, [user, selectedBranchId]);

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryFormData.name.trim()) {
      alert("Lütfen kategori adı girin");
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post("/admin/expense-categories", {
        name: categoryFormData.name.trim(),
      });
      alert("Kategori başarıyla oluşturuldu");
      setCategoryFormData({ name: "" });
      setShowCategoryForm(false);
      fetchCategories();
    } catch (err: any) {
      alert(err.response?.data?.error || "Kategori oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !expenseFormData.category_id ||
      !expenseFormData.amount ||
      parseFloat(expenseFormData.amount) <= 0
    ) {
      alert("Lütfen kategori seçin ve geçerli bir tutar girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        category_id: parseInt(expenseFormData.category_id),
        date: expenseFormData.date,
        amount: parseFloat(expenseFormData.amount),
        description: expenseFormData.description,
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/expenses", payload);
      alert("Gider başarıyla eklendi");
      setExpenseFormData({
        category_id: "",
        date: new Date().toISOString().split("T")[0],
        amount: "",
        description: "",
      });
      setShowExpenseForm(false);
      fetchExpenses();
    } catch (err: any) {
      alert(err.response?.data?.error || "Gider eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalShipmentCosts = shipments.reduce((sum, sh) => sum + (sh.total_amount || 0), 0);
  const totalAllCosts = totalExpenses + totalShipmentCosts;

  const handleUndo = async (logId: number, expenseId: number) => {
    if (!confirm("Bu işlemi geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("İşlem başarıyla geri alındı");
      fetchExpenses();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const canUndo = (expense: ExpenseWithLog): boolean => {
    if (!expense.log_id || expense.is_undone) {
      return false;
    }
    // Super admin her şeyi geri alabilir
    if (user?.role === "super_admin") {
      return true;
    }
    // Branch admin sadece kendi işlemlerini geri alabilir
    return expense.created_by_user_id === user?.id;
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#555555]">
          Gider kayıtları ve işlem geçmişi
        </p>
        <div className="flex gap-2">
          {user?.role === "super_admin" && (
            <button
              onClick={() => setShowCategoryForm(!showCategoryForm)}
              className="px-4 py-2 rounded-lg text-sm transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5]"
            >
              {showCategoryForm ? "Formu Gizle" : "Kategori Ekle"}
            </button>
          )}
          <button
            onClick={() => setShowExpenseForm(!showExpenseForm)}
            className="px-4 py-2 rounded-lg text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
          >
            {showExpenseForm ? "Formu Gizle" : "Gider Ekle"}
          </button>
        </div>
      </div>

      {user?.role === "super_admin" && showCategoryForm && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Yeni Gider Kategorisi</h2>
          <form onSubmit={handleCategorySubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Kategori Adı
              </label>
              <input
                type="text"
                value={categoryFormData.name}
                onChange={(e) =>
                  setCategoryFormData({ name: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="Örn: Manav Gideri"
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
                  setShowCategoryForm(false);
                  setCategoryFormData({ name: "" });
                }}
                className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {showExpenseForm && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Yeni Gider</h2>
          <form onSubmit={handleExpenseSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Kategori
              </label>
              <select
                value={expenseFormData.category_id}
                onChange={(e) =>
                  setExpenseFormData({
                    ...expenseFormData,
                    category_id: e.target.value,
                  })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                required
              >
                <option value="">Kategori seçin...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#555555] mb-1">
                  Tarih
                </label>
                <input
                  type="date"
                  value={expenseFormData.date}
                  onChange={(e) =>
                    setExpenseFormData({
                      ...expenseFormData,
                      date: e.target.value,
                    })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#555555] mb-1">
                  Tutar (TL)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={expenseFormData.amount}
                  onChange={(e) =>
                    setExpenseFormData({
                      ...expenseFormData,
                      amount: e.target.value,
                    })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Açıklama (Opsiyonel)
              </label>
              <input
                type="text"
                value={expenseFormData.description}
                onChange={(e) =>
                  setExpenseFormData({
                    ...expenseFormData,
                    description: e.target.value,
                  })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="Açıklama..."
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
              >
                {submitting ? "Ekleniyor..." : "Ekle"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExpenseForm(false);
                  setExpenseFormData({
                    category_id: "",
                    date: new Date().toISOString().split("T")[0],
                    amount: "",
                    description: "",
                  });
                }}
                className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Toplam Özet */}
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-3 text-[#8F1A9F]">Toplam Gider Özeti</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-[#222222] mb-1">Giderler</div>
            <div className="text-lg font-bold text-red-400">
              {totalExpenses.toFixed(2)} TL
            </div>
          </div>
          <div>
            <div className="text-xs text-[#222222] mb-1">Merkez Sevkiyatı</div>
            <div className="text-lg font-bold text-orange-400">
              {totalShipmentCosts.toFixed(2)} TL
            </div>
          </div>
          <div>
            <div className="text-xs text-[#222222] mb-1">Toplam</div>
            <div className="text-lg font-bold text-yellow-400">
              {totalAllCosts.toFixed(2)} TL
            </div>
          </div>
        </div>
      </div>

      {/* Merkez Sevkiyatı */}
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Merkez Sevkiyatı</h2>
          {shipments.length > 0 && (
            <div className="text-sm font-bold text-orange-400">
              Toplam: {totalShipmentCosts.toFixed(2)} TL
            </div>
          )}
        </div>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : shipments.length === 0 ? (
          <p className="text-xs text-[#222222]">Henüz sevkiyat kaydı yok</p>
        ) : (
          <div className="space-y-2">
            {shipments.map((shipment) => (
              <div
                key={shipment.id}
                className="p-3 bg-white rounded-xl border border-[#E5E5E5] shadow-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{shipment.date}</span>
                      {shipment.note && (
                        <>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-xs text-[#222222]">{shipment.note}</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-[#222222]">
                      {shipment.items?.length || 0} ürün
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-right text-orange-400">
                    {shipment.total_amount.toFixed(2)} TL
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Gider Kayıtları</h2>
          {expenses.length > 0 && (
            <div className="text-sm font-bold text-red-400">
              Toplam: {totalExpenses.toFixed(2)} TL
            </div>
          )}
        </div>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : expenses.length === 0 ? (
          <p className="text-xs text-[#222222]">Henüz gider kaydı yok</p>
        ) : (
          <div className="space-y-2">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className={`p-3 bg-white rounded-xl border ${
                  expense.is_undone
                    ? "border-[#CCCCCC] opacity-60"
                    : "border-[#E5E5E5]"
                } shadow-sm`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{expense.category}</span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-[#222222]">
                        {expense.date}
                      </span>
                      {expense.created_by_user_name && (
                        <>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-xs text-slate-300">
                            👤 {expense.created_by_user_name}
                          </span>
                        </>
                      )}
                      {expense.is_undone && (
                        <>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-xs text-yellow-400">
                            (Geri Alındı)
                          </span>
                        </>
                      )}
                    </div>
                    {expense.description && (
                      <div className="text-xs text-[#222222]">
                        {expense.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-right">
                      {expense.amount.toFixed(2)} TL
                    </div>
                    {expense.log_id && canUndo(expense) && (
                      <button
                        onClick={() =>
                          handleUndo(expense.log_id!, expense.id)
                        }
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors whitespace-nowrap"
                      >
                        Geri Al
                      </button>
                    )}
                    {!expense.log_id && (
                      <span className="text-xs text-slate-500 italic">
                        Log yok
                      </span>
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
