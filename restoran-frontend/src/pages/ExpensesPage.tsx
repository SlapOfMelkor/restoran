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

interface ExpensePayment {
  id: number;
  branch_id: number;
  category_id: number;
  category_name: string;
  amount: number;
  date: string;
  description: string;
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensePayments, setExpensePayments] = useState<ExpensePayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState({ name: "" });
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseFormData, setExpenseFormData] = useState({
    category_id: "",
    date: new Date().toISOString().split("T")[0],
    amount: "",
    description: "",
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
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
      const res = await apiClient.get("/expenses", { params });
      setExpenses(res.data || []);
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
      const res = await apiClient.get("/expense-payments", { params });
      setExpensePayments(res.data || []);
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
      setShowCategoryForm(false);
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
      setShowExpenseForm(false);
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
      setShowPaymentForm(false);
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

  const openExpenseFormForCategory = (categoryId: number) => {
    setExpenseFormData({
      category_id: categoryId.toString(),
      date: new Date().toISOString().split("T")[0],
      amount: "",
      description: "",
    });
    setShowExpenseForm(true);
  };

  const openPaymentFormForCategory = (categoryId: number) => {
    setPaymentFormData({
      category_id: categoryId.toString(),
      date: new Date().toISOString().split("T")[0],
      amount: "",
      description: "",
    });
    setShowPaymentForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#555555]">
          Kategori bazlı gider ve borç yönetimi
        </p>
        <div className="flex gap-2">
          {user?.role === "super_admin" && (
            <button
              onClick={() => setShowCategoryForm(true)}
              className="px-4 py-2 rounded-lg text-sm transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5]"
            >
              Kategori Ekle
            </button>
          )}
        </div>
      </div>

      {user?.role === "super_admin" && (
        <Modal
          isOpen={showCategoryForm}
          onClose={() => {
            setShowCategoryForm(false);
            setCategoryFormData({ name: "" });
          }}
          title="Yeni Gider Kategorisi"
        >
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
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 rounded text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
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
        </Modal>
      )}

      {/* Kategori Kutucukları */}
      {loading ? (
        <p className="text-xs text-[#222222]">Yükleniyor...</p>
      ) : categoryBalances.length === 0 ? (
        <p className="text-xs text-[#222222]">Henüz kategori yok</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {categoryBalances.map((balance) => {
            const categoryExpenses = getCategoryExpenses(balance.category_id);
            const categoryPayments = getCategoryPayments(balance.category_id);
            const isSelected = selectedCategoryId === balance.category_id;

            return (
              <div
                key={balance.category_id}
                className={`bg-white rounded-xl border-2 ${
                  isSelected ? "border-[#8F1A9F]" : "border-[#E5E5E5]"
                } p-4 shadow-sm`}
              >
                {/* Kategori Başlığı */}
                <div className="mb-3">
                  <h3 className="text-sm font-bold text-[#8F1A9F] mb-2">
                    {balance.category_name}
                  </h3>

                  {/* Borç Özeti */}
                  <div className="space-y-1 mb-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-[#555555]">Toplam Gider:</span>
                      <span className="font-semibold text-red-600">
                        {balance.total_expenses.toFixed(2)} TL
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-[#555555]">Yapılan Ödeme:</span>
                      <span className="font-semibold text-green-600">
                        {balance.total_payments.toFixed(2)} TL
                      </span>
                    </div>
                    <div className="flex justify-between text-xs border-t pt-1">
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

                  {/* Gider Listesi (Özet) */}
                  {categoryExpenses.length > 0 && (
                    <div className="mb-3 max-h-32 overflow-y-auto">
                      <div className="text-xs font-semibold text-[#555555] mb-1">
                        Giderler:
                      </div>
                      <div className="space-y-1">
                        {categoryExpenses.slice(0, 3).map((exp) => (
                          <div
                            key={exp.id}
                            className="text-xs text-[#222222] flex justify-between"
                          >
                            <span>{exp.date}</span>
                            <span className="font-medium">
                              {exp.amount.toFixed(2)} TL
                            </span>
                          </div>
                        ))}
                        {categoryExpenses.length > 3 && (
                          <div className="text-xs text-[#555555] italic">
                            +{categoryExpenses.length - 3} daha...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Ödeme Listesi (Özet) */}
                  {categoryPayments.length > 0 && (
                    <div className="mb-3 max-h-32 overflow-y-auto">
                      <div className="text-xs font-semibold text-[#555555] mb-1">
                        Ödemeler:
                      </div>
                      <div className="space-y-1">
                        {categoryPayments.slice(0, 3).map((pay) => (
                          <div
                            key={pay.id}
                            className="text-xs text-green-600 flex justify-between"
                          >
                            <span>{pay.date}</span>
                            <span className="font-medium">
                              {pay.amount.toFixed(2)} TL
                            </span>
                          </div>
                        ))}
                        {categoryPayments.length > 3 && (
                          <div className="text-xs text-[#555555] italic">
                            +{categoryPayments.length - 3} daha...
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Butonlar */}
                  <div className="flex flex-col gap-2 mt-3">
                    <button
                      onClick={() => openExpenseFormForCategory(balance.category_id)}
                      className="px-3 py-1.5 rounded text-xs transition-colors bg-red-500 hover:bg-red-600 text-white"
                    >
                      Borç Ekle
                    </button>
                    <button
                      onClick={() => openPaymentFormForCategory(balance.category_id)}
                      className="px-3 py-1.5 rounded text-xs transition-colors bg-green-600 hover:bg-green-700 text-white"
                    >
                      Ödeme Yap
                    </button>
                    <button
                      onClick={() =>
                        setSelectedCategoryId(
                          isSelected ? null : balance.category_id
                        )
                      }
                      className="px-3 py-1.5 rounded text-xs transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
                    >
                      {isSelected ? "Detayları Gizle" : "Detayları Göster"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Seçili Kategori Detayları */}
      {selectedCategoryId && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">
            {
              categoryBalances.find((b) => b.category_id === selectedCategoryId)
                ?.category_name
            }{" "}
            Detayları
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Giderler */}
            <div>
              <h3 className="text-xs font-semibold mb-2 text-red-600">Giderler</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {getCategoryExpenses(selectedCategoryId).length === 0 ? (
                  <p className="text-xs text-[#555555]">Henüz gider yok</p>
                ) : (
                  getCategoryExpenses(selectedCategoryId).map((exp) => (
                    <div
                      key={exp.id}
                      className="p-2 bg-white rounded border border-[#E5E5E5]"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-xs font-medium">{exp.date}</div>
                          {exp.description && (
                            <div className="text-xs text-[#555555]">
                              {exp.description}
                            </div>
                          )}
                        </div>
                        <div className="text-xs font-bold text-red-600">
                          {exp.amount.toFixed(2)} TL
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Ödemeler */}
            <div>
              <h3 className="text-xs font-semibold mb-2 text-green-600">Ödemeler</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {getCategoryPayments(selectedCategoryId).length === 0 ? (
                  <p className="text-xs text-[#555555]">Henüz ödeme yok</p>
                ) : (
                  getCategoryPayments(selectedCategoryId).map((pay) => (
                    <div
                      key={pay.id}
                      className="p-2 bg-white rounded border border-[#E5E5E5]"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-xs font-medium">{pay.date}</div>
                          {pay.description && (
                            <div className="text-xs text-[#555555]">
                              {pay.description}
                            </div>
                          )}
                        </div>
                        <div className="text-xs font-bold text-green-600">
                          {pay.amount.toFixed(2)} TL
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gider Ekleme Formu */}
      <Modal
        isOpen={showExpenseForm}
        onClose={() => {
          setShowExpenseForm(false);
          setExpenseFormData({
            category_id: "",
            date: new Date().toISOString().split("T")[0],
            amount: "",
            description: "",
          });
        }}
        title="Borç Ekle (Gider)"
        maxWidth="md"
      >
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
      </Modal>

      {/* Ödeme Formu */}
      <Modal
        isOpen={showPaymentForm}
        onClose={() => {
          setShowPaymentForm(false);
          setPaymentFormData({
            category_id: "",
            date: new Date().toISOString().split("T")[0],
            amount: "",
            description: "",
          });
        }}
        title="Ödeme Yap"
        maxWidth="md"
      >
        <form onSubmit={handlePaymentSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Kategori
              </label>
              <select
                value={paymentFormData.category_id}
                onChange={(e) =>
                  setPaymentFormData({
                    ...paymentFormData,
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
                <label className="block text-xs text-[#555555] mb-1">
                  Tutar (TL)
                </label>
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
              onClick={() => {
                setShowPaymentForm(false);
                setPaymentFormData({
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
      </Modal>
    </div>
  );
};
