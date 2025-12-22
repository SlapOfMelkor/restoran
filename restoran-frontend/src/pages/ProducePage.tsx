import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";
import { Modal } from "../components/Modal";

interface Product {
  id: number;
  name: string;
  unit: string;
  stock_code?: string;
}

interface ProducePurchase {
  id: number;
  branch_id: number;
  product_id: number;
  product_name: string;
  product_unit: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  date: string;
  description: string;
}

interface ProducePurchaseWithLog extends ProducePurchase {
  created_by_user_id?: number;
  created_by_user_name?: string;
  created_at?: string;
  log_id?: number;
  is_undone?: boolean;
}

interface ProducePayment {
  id: number;
  branch_id: number;
  amount: number;
  date: string;
  description: string;
}

interface ProducePaymentWithLog extends ProducePayment {
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

interface ProduceBalance {
  branch_id: number;
  total_purchases: number;
  total_payments: number;
  remaining_debt: number;
}

interface MonthlyProduceUsage {
  branch_id: number;
  year: number;
  month: number;
  items: MonthlyProduceUsageItem[];
  grand_total: number;
}

interface MonthlyProduceUsageItem {
  product_id: number;
  product_name: string;
  product_unit: string;
  total_qty: number;
  total_amount: number;
}

interface ProduceCategory {
  id: number;
  name: string;
  branch_id: number;
  created_at: string;
}

export const ProducePage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProduceCategory[]>([]);
  const [purchases, setPurchases] = useState<ProducePurchaseWithLog[]>([]);
  const [payments, setPayments] = useState<ProducePaymentWithLog[]>([]);
  const [balance, setBalance] = useState<ProduceBalance | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyProduceUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<ProduceCategory | null>(null);
  const [productFormData, setProductFormData] = useState({
    name: "",
    unit: "",
    stock_code: "",
  });
  const [categoryFormData, setCategoryFormData] = useState({ name: "" });
  const [purchaseFormData, setPurchaseFormData] = useState({
    product_id: "",
    quantity: "",
    unit_price: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [paymentFormData, setPaymentFormData] = useState({
    amount: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = async () => {
    try {
      const res = await apiClient.get("/produce-products");
      setProducts(res.data);
    } catch (err) {
      console.error("Manav ürünleri yüklenemedi:", err);
    }
  };

  const fetchCategories = async () => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/produce-categories", { params });
      setCategories(res.data);
    } catch (err) {
      console.error("Manav kategorileri yüklenemedi:", err);
    }
  };

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const purchasesRes = await apiClient.get("/produce-purchases", { params });
      
      // Audit log'ları çek
      const logParams: any = {
        entity_type: "produce_purchase",
      };
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          logParams.branch_id = selectedBranchId;
        }
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });
      
      // Purchase'ları log'larla birleştir
      const purchasesWithLogs: ProducePurchaseWithLog[] = purchasesRes.data.map((purchase: ProducePurchase) => {
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "produce_purchase" &&
            log.entity_id === purchase.id &&
            log.action === "create"
        );
        
        return {
          ...purchase,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          created_at: createLog?.created_at,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });
      
      setPurchases(purchasesWithLogs);
    } catch (err) {
      console.error("Alımlar yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const paymentsRes = await apiClient.get("/produce-payments", { params });
      
      // Audit log'ları çek
      const logParams: any = {
        entity_type: "produce_payment",
      };
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          logParams.branch_id = selectedBranchId;
        }
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });
      
      // Payment'ları log'larla birleştir
      const paymentsWithLogs: ProducePaymentWithLog[] = paymentsRes.data.map((payment: ProducePayment) => {
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "produce_payment" &&
            log.entity_id === payment.id &&
            log.action === "create"
        );
        
        return {
          ...payment,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          created_at: createLog?.created_at,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });
      
      setPayments(paymentsWithLogs);
    } catch (err) {
      console.error("Ödemeler yüklenemedi:", err);
    }
  };

  const fetchBalance = async () => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/produce-purchases/balance", { params });
      setBalance(res.data);
    } catch (err) {
      console.error("Borç bilgisi yüklenemedi:", err);
    }
  };

  const fetchMonthlyUsage = async () => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const [year, month] = selectedMonth.split("-");
      params.year = year;
      params.month = month;
      const res = await apiClient.get("/produce-purchases/monthly-usage", { params });
      setMonthlyUsage(res.data);
    } catch (err) {
      console.error("Aylık kullanım yüklenemedi:", err);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchPurchases();
    fetchPayments();
    fetchBalance();
    fetchMonthlyUsage();
  }, [user, selectedBranchId, selectedMonth]);

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const unitPriceNum = parseFloat(purchaseFormData.unit_price);
    const quantityNum = parseFloat(purchaseFormData.quantity);
    
    if (
      !purchaseFormData.product_id ||
      !purchaseFormData.quantity ||
      !purchaseFormData.unit_price ||
      isNaN(quantityNum) || quantityNum <= 0 ||
      isNaN(unitPriceNum) || unitPriceNum <= 0
    ) {
      alert("Lütfen ürün seçin ve geçerli miktar/fiyat girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        product_id: parseInt(purchaseFormData.product_id),
        quantity: quantityNum,
        unit_price: unitPriceNum,
        date: purchaseFormData.date,
        description: purchaseFormData.description,
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/produce-purchases", payload);
      alert("Alım başarıyla eklendi");
      setPurchaseFormData({
        product_id: "",
        quantity: "",
        unit_price: "",
        date: new Date().toISOString().split("T")[0],
        description: "",
      });
      setShowPurchaseForm(false);
      fetchPurchases();
      fetchBalance();
      fetchMonthlyUsage();
    } catch (err: any) {
      alert(err.response?.data?.error || "Alım eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(paymentFormData.amount);
    
    if (!paymentFormData.amount || isNaN(amountNum) || amountNum <= 0) {
      alert("Lütfen geçerli bir tutar girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        amount: amountNum,
        date: paymentFormData.date,
        description: paymentFormData.description,
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/produce-payments", payload);
      alert("Ödeme başarıyla eklendi");
      setPaymentFormData({
        amount: "",
        date: new Date().toISOString().split("T")[0],
        description: "",
      });
      setShowPaymentForm(false);
      fetchPayments();
      fetchBalance();
    } catch (err: any) {
      alert(err.response?.data?.error || "Ödeme eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndoPurchase = async (logId: number, _purchaseId: number) => {
    if (!confirm("Bu alım kaydını geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("Alım kaydı başarıyla geri alındı");
      await fetchPurchases();
      await fetchBalance();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const handleUndoPayment = async (logId: number, _paymentId: number) => {
    if (!confirm("Bu ödeme kaydını geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("Ödeme kaydı başarıyla geri alındı");
      await fetchPayments();
      await fetchBalance();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const canUndoPurchase = (purchase: ProducePurchaseWithLog): boolean => {
    if (!purchase.log_id || purchase.is_undone) {
      return false;
    }
    if (user?.role === "super_admin") {
      return true;
    }
    return purchase.created_by_user_id === user?.id;
  };

  const canUndoPayment = (payment: ProducePaymentWithLog): boolean => {
    if (!payment.log_id || payment.is_undone) {
      return false;
    }
    if (user?.role === "super_admin") {
      return true;
    }
    return payment.created_by_user_id === user?.id;
  };

  // Ürün yönetimi
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productFormData.name.trim() || !productFormData.unit.trim()) {
      alert("Lütfen ürün adı ve birim girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        name: productFormData.name.trim(),
        unit: productFormData.unit.trim(),
      };
      if (productFormData.stock_code.trim()) {
        payload.stock_code = productFormData.stock_code.trim();
      }

      if (editingProduct) {
        await apiClient.put(`/produce-products/${editingProduct.id}`, payload);
        alert("Ürün başarıyla güncellendi");
      } else {
        await apiClient.post("/produce-products", payload);
        alert("Ürün başarıyla oluşturuldu");
      }

      setProductFormData({ name: "", unit: "", stock_code: "" });
      setEditingProduct(null);
      setShowProductModal(false);
      fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || "Ürün işlemi başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm("Bu ürünü silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.delete(`/produce-products/${id}`);
      alert("Ürün başarıyla silindi");
      fetchProducts();
    } catch (err: any) {
      alert(err.response?.data?.error || "Ürün silinemedi");
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductFormData({
      name: product.name,
      unit: product.unit,
      stock_code: product.stock_code || "",
    });
    setShowProductModal(true);
  };

  // Kategori yönetimi
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

      if (editingCategory) {
        await apiClient.put(`/produce-categories/${editingCategory.id}`, payload);
        alert("Kategori başarıyla güncellendi");
      } else {
        await apiClient.post("/produce-categories", payload);
        alert("Kategori başarıyla oluşturuldu");
      }

      setCategoryFormData({ name: "" });
      setEditingCategory(null);
      setShowCategoryModal(false);
      fetchCategories();
    } catch (err: any) {
      alert(err.response?.data?.error || "Kategori işlemi başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!confirm("Bu kategoriyi silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.delete(`/produce-categories/${id}`);
      alert("Kategori başarıyla silindi");
      fetchCategories();
    } catch (err: any) {
      alert(err.response?.data?.error || "Kategori silinemedi");
    }
  };

  const handleEditCategory = (category: ProduceCategory) => {
    setEditingCategory(category);
    setCategoryFormData({ name: category.name });
    setShowCategoryModal(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#555555]">
          Manav alımları ve ödemeleri yönetimi
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditingProduct(null);
              setProductFormData({ name: "", unit: "", stock_code: "" });
              setShowProductModal(true);
            }}
            className="px-4 py-2 rounded-lg text-sm transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5]"
          >
            Ürün Yönetimi
          </button>
          <button
            onClick={() => {
              setEditingCategory(null);
              setCategoryFormData({ name: "" });
              setShowCategoryModal(true);
            }}
            className="px-4 py-2 rounded-lg text-sm transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5]"
          >
            Kategori Yönetimi
          </button>
          <button
            onClick={() => setShowPurchaseForm(true)}
            className="px-4 py-2 rounded-lg text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
          >
            Alım Ekle
          </button>
          <button
            onClick={() => setShowPaymentForm(true)}
            className="px-4 py-2 rounded-lg text-sm transition-colors bg-green-600 hover:bg-green-700 text-white"
          >
            Ödeme Ekle
          </button>
        </div>
      </div>

      {/* Borç Özeti */}
      {balance && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3 text-[#8F1A9F]">Borç Özeti</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-[#222222] mb-1">Toplam Alımlar</div>
              <div className="text-lg font-bold text-blue-600">
                {balance.total_purchases.toFixed(2)} TL
              </div>
            </div>
            <div>
              <div className="text-xs text-[#222222] mb-1">Yapılan Ödemeler</div>
              <div className="text-lg font-bold text-green-600">
                {balance.total_payments.toFixed(2)} TL
              </div>
            </div>
            <div>
              <div className="text-xs text-[#222222] mb-1">Kalan Borç</div>
              <div className={`text-lg font-bold ${balance.remaining_debt >= 0 ? "text-red-600" : "text-green-600"}`}>
                {balance.remaining_debt.toFixed(2)} TL
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alım Formu */}
      <Modal
        isOpen={showPurchaseForm}
        onClose={() => {
          setShowPurchaseForm(false);
          setPurchaseFormData({
            product_id: "",
            quantity: "",
            unit_price: "",
            date: new Date().toISOString().split("T")[0],
            description: "",
          });
        }}
        title="Yeni Manav Alımı"
        maxWidth="md"
      >
        <form onSubmit={handlePurchaseSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Ürün
              </label>
              <select
                value={purchaseFormData.product_id}
                onChange={(e) =>
                  setPurchaseFormData({
                    ...purchaseFormData,
                    product_id: e.target.value,
                  })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                required
              >
                <option value="">Ürün seçin...</option>
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.name} ({prod.unit})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[#555555] mb-1">
                  Miktar
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={purchaseFormData.quantity}
                  onChange={(e) =>
                    setPurchaseFormData({
                      ...purchaseFormData,
                      quantity: e.target.value,
                    })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#555555] mb-1">
                  Birim Fiyat (TL)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchaseFormData.unit_price}
                  onChange={(e) =>
                    setPurchaseFormData({
                      ...purchaseFormData,
                      unit_price: e.target.value,
                    })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#555555] mb-1">
                  Tarih
                </label>
                <input
                  type="date"
                  value={purchaseFormData.date}
                  onChange={(e) =>
                    setPurchaseFormData({
                      ...purchaseFormData,
                      date: e.target.value,
                    })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
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
                value={purchaseFormData.description}
                onChange={(e) =>
                  setPurchaseFormData({
                    ...purchaseFormData,
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
                setShowPurchaseForm(false);
                setPurchaseFormData({
                  product_id: "",
                  quantity: "",
                  unit_price: "",
                  date: new Date().toISOString().split("T")[0],
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
            date: new Date().toISOString().split("T")[0],
            amount: "",
            description: "",
          });
        }}
        title="Manav Ödemesi"
        maxWidth="md"
      >
        <form onSubmit={handlePaymentSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
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
              {submitting ? "Ekleniyor..." : "Ekle"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPaymentForm(false);
                setPaymentFormData({
                  amount: "",
                  date: new Date().toISOString().split("T")[0],
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

      {/* Aylık Kullanım */}
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Aylık Ürün Kullanımı</h2>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
          />
        </div>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : monthlyUsage && monthlyUsage.items.length > 0 ? (
          <div className="space-y-2">
            {monthlyUsage.items.map((item) => (
              <div
                key={item.product_id}
                className="p-3 bg-white rounded-xl border border-[#E5E5E5] shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{item.product_name}</div>
                    <div className="text-xs text-[#222222]">
                      {item.total_qty.toFixed(2)} {item.product_unit}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-[#8F1A9F]">
                    {item.total_amount.toFixed(2)} TL
                  </div>
                </div>
              </div>
            ))}
            <div className="p-3 bg-white rounded-xl border-2 border-[#8F1A9F] shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold">Toplam</div>
                <div className="text-lg font-bold text-[#8F1A9F]">
                  {monthlyUsage.grand_total.toFixed(2)} TL
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#222222]">
            Bu ay için kullanım kaydı yok
          </p>
        )}
      </div>

      {/* Alımlar Listesi */}
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Alım Kayıtları</h2>
          {purchases.length > 0 && (
            <div className="text-sm font-bold text-blue-600">
              Toplam: {purchases.reduce((sum, p) => sum + p.total_amount, 0).toFixed(2)} TL
            </div>
          )}
        </div>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : purchases.length === 0 ? (
          <p className="text-xs text-[#222222]">Henüz alım kaydı yok</p>
        ) : (
          <div className="space-y-2">
            {purchases.map((purchase) => (
              <div
                key={purchase.id}
                className={`p-3 bg-white rounded-xl border ${
                  purchase.is_undone
                    ? "border-[#CCCCCC] opacity-60"
                    : "border-[#E5E5E5]"
                } shadow-sm`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{purchase.product_name}</span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-[#222222]">
                        {purchase.quantity.toFixed(2)} {purchase.product_unit}
                      </span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-[#222222]">{purchase.date}</span>
                      {purchase.created_by_user_name && (
                        <>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-xs text-[#222222]">
                            👤 {purchase.created_by_user_name}
                          </span>
                        </>
                      )}
                      {purchase.is_undone && (
                        <>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-xs text-yellow-400">
                            (Geri Alındı)
                          </span>
                        </>
                      )}
                    </div>
                    {purchase.description && (
                      <div className="text-xs text-[#222222]">
                        {purchase.description}
                      </div>
                    )}
                    <div className="text-xs text-slate-500">
                      Birim fiyat: {purchase.unit_price.toFixed(2)} TL
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-right">
                      {purchase.total_amount.toFixed(2)} TL
                    </div>
                    {purchase.log_id && canUndoPurchase(purchase) && (
                      <button
                        onClick={() =>
                          handleUndoPurchase(purchase.log_id!, purchase.id)
                        }
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors whitespace-nowrap"
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

      {/* Ödemeler Listesi */}
      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Ödeme Kayıtları</h2>
          {payments.length > 0 && (
            <div className="text-sm font-bold text-green-600">
              Toplam: {payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2)} TL
            </div>
          )}
        </div>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : payments.length === 0 ? (
          <p className="text-xs text-[#222222]">Henüz ödeme kaydı yok</p>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className={`p-3 bg-white rounded-xl border ${
                  payment.is_undone
                    ? "border-[#CCCCCC] opacity-60"
                    : "border-[#E5E5E5]"
                } shadow-sm`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">Manav Ödemesi</span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-[#222222]">{payment.date}</span>
                      {payment.created_by_user_name && (
                        <>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-xs text-[#222222]">
                            👤 {payment.created_by_user_name}
                          </span>
                        </>
                      )}
                      {payment.is_undone && (
                        <>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-xs text-yellow-400">
                            (Geri Alındı)
                          </span>
                        </>
                      )}
                    </div>
                    {payment.description && (
                      <div className="text-xs text-[#222222]">
                        {payment.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-right text-green-600">
                      {payment.amount.toFixed(2)} TL
                    </div>
                    {payment.log_id && canUndoPayment(payment) && (
                      <button
                        onClick={() =>
                          handleUndoPayment(payment.log_id!, payment.id)
                        }
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors whitespace-nowrap"
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

      {/* Ürün Yönetimi Modal */}
      <Modal
        isOpen={showProductModal}
        onClose={() => {
          setShowProductModal(false);
          setEditingProduct(null);
          setProductFormData({ name: "", unit: "", stock_code: "" });
        }}
        title={editingProduct ? "Ürün Düzenle" : "Yeni Ürün Ekle"}
        maxWidth="md"
      >
        <form onSubmit={handleProductSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[#555555] mb-1">Ürün Adı</label>
            <input
              type="text"
              value={productFormData.name}
              onChange={(e) => setProductFormData({ ...productFormData, name: e.target.value })}
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              placeholder="Örn: Domates, Salatalık"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[#555555] mb-1">Birim</label>
            <input
              type="text"
              value={productFormData.unit}
              onChange={(e) => setProductFormData({ ...productFormData, unit: e.target.value })}
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              placeholder="Örn: kg, adet, koli"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-[#555555] mb-1">Stok Kodu (Opsiyonel)</label>
            <input
              type="text"
              value={productFormData.stock_code}
              onChange={(e) => setProductFormData({ ...productFormData, stock_code: e.target.value })}
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              placeholder="Örn: DOM001"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
            >
              {submitting ? "Kaydediliyor..." : editingProduct ? "Güncelle" : "Ekle"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowProductModal(false);
                setEditingProduct(null);
                setProductFormData({ name: "", unit: "", stock_code: "" });
              }}
              className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
            >
              İptal
            </button>
          </div>
        </form>

        {/* Ürün Listesi */}
        <div className="mt-6 border-t border-[#E5E5E5] pt-4">
          <h3 className="text-sm font-semibold mb-3">Mevcut Ürünler</h3>
          {products.length === 0 ? (
            <p className="text-xs text-[#555555]">Henüz ürün yok</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-2 bg-white rounded border border-[#E5E5E5]"
                >
                  <div>
                    <div className="text-sm font-medium">{product.name}</div>
                    <div className="text-xs text-[#555555]">
                      {product.unit} {product.stock_code && `• ${product.stock_code}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditProduct(product)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors text-white"
                    >
                      Düzenle
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(product.id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors text-white"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Kategori Yönetimi Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setEditingCategory(null);
          setCategoryFormData({ name: "" });
        }}
        title={editingCategory ? "Kategori Düzenle" : "Yeni Kategori Ekle"}
        maxWidth="md"
      >
        <form onSubmit={handleCategorySubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[#555555] mb-1">Kategori Adı</label>
            <input
              type="text"
              value={categoryFormData.name}
              onChange={(e) => setCategoryFormData({ name: e.target.value })}
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              placeholder="Örn: Sebze, Meyve"
              required
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
            >
              {submitting ? "Kaydediliyor..." : editingCategory ? "Güncelle" : "Ekle"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCategoryModal(false);
                setEditingCategory(null);
                setCategoryFormData({ name: "" });
              }}
              className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
            >
              İptal
            </button>
          </div>
        </form>

        {/* Kategori Listesi */}
        <div className="mt-6 border-t border-[#E5E5E5] pt-4">
          <h3 className="text-sm font-semibold mb-3">Mevcut Kategoriler</h3>
          {categories.length === 0 ? (
            <p className="text-xs text-[#555555]">Henüz kategori yok</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-2 bg-white rounded border border-[#E5E5E5]"
                >
                  <div className="text-sm font-medium">{category.name}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditCategory(category)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors text-white"
                    >
                      Düzenle
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(category.id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors text-white"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

