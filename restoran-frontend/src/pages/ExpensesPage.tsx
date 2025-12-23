import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";
import { Modal } from "../components/Modal";

interface ExpenseCategory {
  id: number;
  name: string;
}

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
  log_id?: number;
  is_undone?: boolean;
}

interface ExpensePayment {
  id: number;
  branch_id: number;
  category_id: number;
  category_name: string;
  amount: number;
  date: string;
  description: string;
}

interface ExpensePaymentWithLog extends ExpensePayment {
  created_by_user_id?: number;
  created_by_user_name?: string;
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

interface CategoryBalance {
  category_id: number;
  category_name: string;
  total_expenses: number;
  total_payments: number;
  remaining_debt: number;
}

interface AllCategoriesBalance {
  branch_id: number;
  categories: CategoryBalance[];
}

export const ExpensesPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [categoryBalances, setCategoryBalances] = useState<CategoryBalance[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithLog[]>([]);
  const [expensePayments, setExpensePayments] = useState<ExpensePaymentWithLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCategoryManagement, setShowCategoryManagement] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState({ name: "" });
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseFormData, setExpenseFormData] = useState({
    category_id: "",
    date: new Date().toISOString().split("T")[0],
    amount: "",
    description: "",
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryModalView, setCategoryModalView] = useState<"overview" | "add-expense" | "add-payment" | "details">("overview");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState({
    category_id: "",
    date: new Date().toISOString().split("T")[0],
    amount: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchCategories = async () => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/expense-categories", { params });
      setCategories(res.data);
    } catch (err) {
      console.error("Kategoriler yüklenemedi:", err);
    }
  };

  const fetchCategoryBalances = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/expense-payments/balance-by-category", { params });
      setCategoryBalances(res.data.categories || []);
    } catch (err) {
      console.error("Kategori bakiye bilgisi yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchExpenses = async (categoryId?: number) => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      if (categoryId) {
        params.category_id = categoryId;
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
      } else if (user?.role === "branch_admin" && user.branch_id) {
        logParams.branch_id = user.branch_id;
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });

      // Expenses'i log'larla birleştir
      const expensesWithLogs: ExpenseWithLog[] = (expensesRes.data || []).map((expense: Expense) => {
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "expense" &&
            log.entity_id === expense.id &&
            log.action === "create"
        );

        return {
          ...expense,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });

      setExpenses(expensesWithLogs);
    } catch (err) {
      console.error("Giderler yüklenemedi:", err);
    }
  };

  const fetchExpensePayments = async (categoryId?: number) => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      if (categoryId) {
        params.category_id = categoryId;
      }
      const paymentsRes = await apiClient.get("/expense-payments", { params });

      // Audit log'ları çek
      const logParams: any = {
        entity_type: "expense_payment",
      };
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          logParams.branch_id = selectedBranchId;
        }
      } else if (user?.role === "branch_admin" && user.branch_id) {
        logParams.branch_id = user.branch_id;
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });

      // Payments'i log'larla birleştir
      const paymentsWithLogs: ExpensePaymentWithLog[] = (paymentsRes.data || []).map((payment: ExpensePayment) => {
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "expense_payment" &&
            log.entity_id === payment.id &&
            log.action === "create"
        );

        return {
          ...payment,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });

      setExpensePayments(paymentsWithLogs);
    } catch (err) {
      console.error("Gider ödemeleri yüklenemedi:", err);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchCategoryBalances();
    fetchExpenses();
    fetchExpensePayments();
  }, [user, selectedBranchId]);

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryFormData.name.trim()) {
      alert("Lütfen kategori adı girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        name: categoryFormData.name.trim(),
      };
      
      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/admin/expense-categories", payload);
      alert("Kategori başarıyla oluşturuldu");
      setCategoryFormData({ name: "" });
      fetchCategories();
      fetchCategoryBalances();
    } catch (err: any) {
      alert(err.response?.data?.error || "Kategori oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(expenseFormData.amount);

    if (
      !expenseFormData.category_id ||
      !expenseFormData.amount ||
      isNaN(amountNum) || amountNum <= 0
    ) {
      alert("Lütfen kategori seçin ve geçerli bir tutar girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        category_id: parseInt(expenseFormData.category_id),
        date: expenseFormData.date,
        amount: amountNum,
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
      setCategoryModalView("overview");
      fetchExpenses();
      fetchCategoryBalances();
    } catch (err: any) {
      alert(err.response?.data?.error || "Gider eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(paymentFormData.amount);

    if (
      !paymentFormData.category_id ||
      !paymentFormData.amount ||
      isNaN(amountNum) || amountNum <= 0
    ) {
      alert("Lütfen kategori seçin ve geçerli bir tutar girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        category_id: parseInt(paymentFormData.category_id),
        date: paymentFormData.date,
        amount: amountNum,
        description: paymentFormData.description,
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/expense-payments", payload);
      alert("Ödeme başarıyla eklendi");
      setPaymentFormData({
        category_id: "",
        date: new Date().toISOString().split("T")[0],
        amount: "",
        description: "",
      });
      setCategoryModalView("overview");
      fetchExpensePayments();
      fetchCategoryBalances();
    } catch (err: any) {
      alert(err.response?.data?.error || "Ödeme eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const getCategoryExpenses = (categoryId: number) => {
    return expenses.filter((exp) => exp.category_id === categoryId);
  };

  const getCategoryPayments = (categoryId: number) => {
    return expensePayments.filter((pay) => pay.category_id === categoryId);
  };

  const handleUndoExpense = async (logId: number, expenseId: number) => {
    if (!confirm("Bu gider kaydını geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("Gider kaydı başarıyla geri alındı");
      fetchExpenses();
      fetchCategoryBalances();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const handleUndoPayment = async (logId: number, paymentId: number) => {
    if (!confirm("Bu ödeme kaydını geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("Ödeme kaydı başarıyla geri alındı");
      fetchExpensePayments();
      fetchCategoryBalances();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const canUndoExpense = (expense: ExpenseWithLog): boolean => {
    if (!expense.log_id || expense.is_undone) {
      return false;
    }
    if (user?.role === "super_admin") {
      return true;
    }
    // Branch admin kendi şubesindeki tüm kayıtları geri alabilir
    if (user?.role === "branch_admin" && user.branch_id) {
      return expense.branch_id === user.branch_id;
    }
    return false;
  };

  const canUndoPayment = (payment: ExpensePaymentWithLog): boolean => {
    if (!payment.log_id || payment.is_undone) {
      return false;
    }
    if (user?.role === "super_admin") {
      return true;
    }
    // Branch admin kendi şubesindeki tüm kayıtları geri alabilir
    if (user?.role === "branch_admin" && user.branch_id) {
      return payment.branch_id === user.branch_id;
    }
    return false;
  };


  return (
    <div className="space-y-4">
      {user?.role === "super_admin" && (
        <div className="flex items-center justify-center py-8">
          <button
            onClick={() => {
              fetchCategories();
              setShowCategoryManagement(true);
            }}
            className="px-8 py-4 rounded-xl text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl"
          >
            Kategorileri Yönet
          </button>
        </div>
      )}

      {/* Kategorileri Yönet Modal */}
      {user?.role === "super_admin" && (
        <Modal
          isOpen={showCategoryManagement}
          onClose={() => {
            setShowCategoryManagement(false);
            setCategoryFormData({ name: "" });
          }}
          title="Gider Kategorilerini Yönet"
          maxWidth="lg"
        >
          <div className="space-y-4">
            {/* Kategori Ekleme Formu */}
            <div className="bg-[#F4F4F4] rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Yeni Kategori Ekle</h3>
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
                    placeholder="Örn: Manav, Kasap, Fırın"
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
                  >
                    {submitting ? "Oluşturuluyor..." : "Kategori Ekle"}
                  </button>
                </div>
              </form>
            </div>

            {/* Kategori Listesi */}
            <div>
              <h3 className="text-sm font-semibold mb-3">Mevcut Kategoriler</h3>
              {categories.length === 0 ? (
                <p className="text-xs text-[#222222] text-center py-4">
                  Henüz kategori yok
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-3 bg-white rounded-lg border border-[#E5E5E5]"
                    >
                      <span className="text-sm font-medium">{category.name}</span>
                      <button
                        onClick={async () => {
                          if (!confirm(`"${category.name}" kategorisini silmek istediğinize emin misiniz?`)) {
                            return;
                          }
                          try {
                            await apiClient.delete(`/admin/expense-categories/${category.id}`);
                            alert("Kategori başarıyla silindi");
                            fetchCategories();
                            fetchCategoryBalances();
                          } catch (err: any) {
                            const errorMessage = err.response?.data?.error || "Kategori silinemedi";
                            alert(errorMessage);
                          }
                        }}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors text-white"
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Kategori Butonları */}
      {loading ? (
        <p className="text-xs text-[#222222]">Yükleniyor...</p>
      ) : categoryBalances.length === 0 ? (
        <p className="text-xs text-[#222222]">Henüz kategori yok</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {categoryBalances.map((balance) => (
            <button
              key={balance.category_id}
              onClick={() => {
                setSelectedCategoryId(balance.category_id);
                setCategoryModalView("overview");
                setShowCategoryModal(true);
              }}
              className="bg-white rounded-xl border-2 border-[#E5E5E5] hover:border-[#8F1A9F] p-6 shadow-sm transition-all hover:shadow-md text-left"
            >
              <h3 className="text-base font-bold text-[#8F1A9F] mb-2">
                {balance.category_name}
              </h3>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#555555]">Kalan Borç:</span>
                  <span
                    className={`font-bold ${
                      balance.remaining_debt >= 0 ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {balance.remaining_debt.toFixed(2)} TL
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Kategori Detay Modal */}
      {selectedCategoryId && (
        <Modal
          isOpen={showCategoryModal}
          onClose={() => {
            setShowCategoryModal(false);
            setCategoryModalView("overview");
            setSelectedCategoryId(null);
          }}
          title={
            categoryBalances.find((b) => b.category_id === selectedCategoryId)
              ?.category_name || "Kategori Detayları"
          }
          maxWidth="lg"
        >
          {categoryModalView === "overview" && (
            <div className="space-y-4">
              {/* Borç Özeti */}
              {(() => {
                const balance = categoryBalances.find(
                  (b) => b.category_id === selectedCategoryId
                );
                if (!balance) return null;
                return (
                  <div className="bg-[#F4F4F4] rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#555555]">Toplam Gider:</span>
                      <span className="font-semibold text-red-600">
                        {balance.total_expenses.toFixed(2)} TL
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#555555]">Yapılan Ödeme:</span>
                      <span className="font-semibold text-green-600">
                        {balance.total_payments.toFixed(2)} TL
                      </span>
                    </div>
                    <div className="flex justify-between text-sm border-t pt-2 mt-2">
                      <span className="text-[#555555] font-semibold">Kalan Borç:</span>
                      <span
                        className={`font-bold ${
                          balance.remaining_debt >= 0 ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {balance.remaining_debt.toFixed(2)} TL
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Aksiyon Butonları */}
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => {
                    setCategoryModalView("add-expense");
                    setExpenseFormData({
                      category_id: selectedCategoryId!.toString(),
                      date: new Date().toISOString().split("T")[0],
                      amount: "",
                      description: "",
                    });
                  }}
                  className="px-4 py-3 rounded-lg text-sm transition-colors bg-red-500 hover:bg-red-600 text-white font-medium"
                >
                  Borç Ekle
                </button>
                <button
                  onClick={() => {
                    setCategoryModalView("add-payment");
                    setPaymentFormData({
                      category_id: selectedCategoryId!.toString(),
                      date: new Date().toISOString().split("T")[0],
                      amount: "",
                      description: "",
                    });
                  }}
                  className="px-4 py-3 rounded-lg text-sm transition-colors bg-green-600 hover:bg-green-700 text-white font-medium"
                >
                  Ödeme Yap
                </button>
                <button
                  onClick={() => setCategoryModalView("details")}
                  className="px-4 py-3 rounded-lg text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white font-medium"
                >
                  Detayları Göster
                </button>
              </div>
            </div>
          )}

          {categoryModalView === "add-expense" && (
            <form onSubmit={handleExpenseSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#555555] mb-1">Tarih</label>
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
                  <label className="block text-xs text-[#555555] mb-1">Tutar (TL)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
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
                  onClick={() => setCategoryModalView("overview")}
                  className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
                >
                  Geri
                </button>
              </div>
            </form>
          )}

          {categoryModalView === "add-payment" && (
            <form onSubmit={handlePaymentSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#555555] mb-1">Tarih</label>
                  <input
                    type="date"
                    value={paymentFormData.date}
                    onChange={(e) =>
                      setPaymentFormData({
                        ...paymentFormData,
                        date: e.target.value,
                      })
                    }
                    className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1">Tutar (TL)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentFormData.amount}
                    onChange={(e) =>
                      setPaymentFormData({
                        ...paymentFormData,
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
                  value={paymentFormData.description}
                  onChange={(e) =>
                    setPaymentFormData({
                      ...paymentFormData,
                      description: e.target.value,
                    })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  placeholder="Açıklama..."
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 rounded text-sm transition-colors bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white"
                >
                  {submitting ? "Ekleniyor..." : "Ödeme Yap"}
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryModalView("overview")}
                  className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
                >
                  Geri
                </button>
              </div>
            </form>
          )}

          {categoryModalView === "details" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Giderler */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-red-600">Giderler</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {getCategoryExpenses(selectedCategoryId).length === 0 ? (
                      <p className="text-xs text-[#555555]">Henüz gider yok</p>
                    ) : (
                      getCategoryExpenses(selectedCategoryId).map((exp) => (
                        <div
                          key={exp.id}
                          className={`p-2 bg-white rounded border ${
                            exp.is_undone
                              ? "border-[#CCCCCC] opacity-60"
                              : "border-[#E5E5E5]"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <div className="text-xs font-medium">{exp.date}</div>
                                {exp.is_undone && (
                                  <>
                                    <span className="text-xs text-slate-500">•</span>
                                    <span className="text-xs text-yellow-400">(Geri Alındı)</span>
                                  </>
                                )}
                              </div>
                              {exp.description && (
                                <div className="text-xs text-[#555555]">
                                  {exp.description}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs font-bold text-red-600">
                                {exp.amount.toFixed(2)} TL
                              </div>
                              {exp.log_id && canUndoExpense(exp) && (
                                <button
                                  onClick={() => handleUndoExpense(exp.log_id!, exp.id)}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors text-white whitespace-nowrap"
                                >
                                  Geri Al
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Ödemeler */}
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-green-600">Ödemeler</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {getCategoryPayments(selectedCategoryId).length === 0 ? (
                      <p className="text-xs text-[#555555]">Henüz ödeme yok</p>
                    ) : (
                      getCategoryPayments(selectedCategoryId).map((pay) => (
                        <div
                          key={pay.id}
                          className={`p-2 bg-white rounded border ${
                            pay.is_undone
                              ? "border-[#CCCCCC] opacity-60"
                              : "border-[#E5E5E5]"
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <div className="text-xs font-medium">{pay.date}</div>
                                {pay.is_undone && (
                                  <>
                                    <span className="text-xs text-slate-500">•</span>
                                    <span className="text-xs text-yellow-400">(Geri Alındı)</span>
                                  </>
                                )}
                              </div>
                              {pay.description && (
                                <div className="text-xs text-[#555555]">
                                  {pay.description}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-xs font-bold text-green-600">
                                {pay.amount.toFixed(2)} TL
                              </div>
                              {pay.log_id && canUndoPayment(pay) && (
                                <button
                                  onClick={() => handleUndoPayment(pay.log_id!, pay.id)}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors text-white whitespace-nowrap"
                                >
                                  Geri Al
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setCategoryModalView("overview")}
                className="w-full px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
              >
                Geri
              </button>
            </div>
          )}
        </Modal>
      )}

    </div>
  );
};
