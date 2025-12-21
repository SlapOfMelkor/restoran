import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";
import { handleNumberInputChange, getNumberValue } from "../utils/numberFormat";

interface Product {
  id: number;
  name: string;
  unit: string;
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

interface ProducePayment {
  id: number;
  branch_id: number;
  amount: number;
  date: string;
  description: string;
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

export const ProducePage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [purchases, setPurchases] = useState<ProducePurchase[]>([]);
  const [payments, setPayments] = useState<ProducePayment[]>([]);
  const [balance, setBalance] = useState<ProduceBalance | null>(null);
  const [monthlyUsage, setMonthlyUsage] = useState<MonthlyProduceUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
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
      const res = await apiClient.get("/products");
      setProducts(res.data);
    } catch (err) {
      console.error("Ürünler yüklenemedi:", err);
    }
  };

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/produce-purchases", { params });
      setPurchases(res.data || []);
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
      const res = await apiClient.get("/produce-payments", { params });
      setPayments(res.data || []);
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
    fetchPurchases();
    fetchPayments();
    fetchBalance();
    fetchMonthlyUsage();
  }, [user, selectedBranchId, selectedMonth]);

  const handlePurchaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const unitPriceNum = getNumberValue(purchaseFormData.unit_price);
    const quantityNum = parseFloat(purchaseFormData.quantity);
    
    if (
      !purchaseFormData.product_id ||
      !purchaseFormData.quantity ||
      !purchaseFormData.unit_price ||
      quantityNum <= 0 ||
      unitPriceNum <= 0
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
    const amountNum = getNumberValue(paymentFormData.amount);
    
    if (!paymentFormData.amount || amountNum <= 0) {
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#555555]">
          Manav alımları ve ödemeleri yönetimi
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPurchaseForm(!showPurchaseForm)}
            className="px-4 py-2 rounded-lg text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
          >
            {showPurchaseForm ? "Formu Gizle" : "Alım Ekle"}
          </button>
          <button
            onClick={() => setShowPaymentForm(!showPaymentForm)}
            className="px-4 py-2 rounded-lg text-sm transition-colors bg-green-600 hover:bg-green-700 text-white"
          >
            {showPaymentForm ? "Formu Gizle" : "Ödeme Ekle"}
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
      {showPurchaseForm && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Yeni Manav Alımı</h2>
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
                  type="text"
                  value={purchaseFormData.unit_price}
                  onChange={(e) =>
                    handleNumberInputChange(e, (value) =>
                      setPurchaseFormData({
                        ...purchaseFormData,
                        unit_price: value,
                      })
                    )
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  placeholder="0,00"
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
        </div>
      )}

      {/* Ödeme Formu */}
      {showPaymentForm && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Manav Ödemesi</h2>
          <form onSubmit={handlePaymentSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#555555] mb-1">
                  Tutar (TL)
                </label>
                <input
                  type="text"
                  value={paymentFormData.amount}
                  onChange={(e) =>
                    handleNumberInputChange(e, (value) =>
                      setPaymentFormData({
                        ...paymentFormData,
                        amount: value,
                      })
                    )
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  placeholder="0,00"
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
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded text-sm transition-colors bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white"
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
        </div>
      )}

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
                className="p-3 bg-white rounded-xl border border-[#E5E5E5] shadow-sm"
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
                  <div className="text-sm font-semibold text-right">
                    {purchase.total_amount.toFixed(2)} TL
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
                className="p-3 bg-white rounded-xl border border-[#E5E5E5] shadow-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">Manav Ödemesi</span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-[#222222]">{payment.date}</span>
                    </div>
                    {payment.description && (
                      <div className="text-xs text-[#222222]">
                        {payment.description}
                      </div>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-right text-green-600">
                    {payment.amount.toFixed(2)} TL
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

