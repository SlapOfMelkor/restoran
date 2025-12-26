import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";
import { Modal } from "../components/Modal";

interface TradeTransaction {
  id: number;
  branch_id: number;
  type: "receivable" | "payable";
  amount: number;
  description: string;
  date: string;
  total_paid: number;
  remaining: number;
  created_at: string;
  updated_at: string;
}

interface TradePayment {
  id: number;
  branch_id: number;
  trade_transaction_id: number;
  amount: number;
  payment_date: string;
  description: string;
  created_at: string;
}

export const TradesPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [transactions, setTransactions] = useState<TradeTransaction[]>([]);
  const [payments, setPayments] = useState<{ [key: number]: TradePayment[] }>({});
  const [loading, setLoading] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TradeTransaction | null>(null);
  const [transactionFormData, setTransactionFormData] = useState({
    type: "receivable" as "receivable" | "payable",
    amount: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [paymentFormData, setPaymentFormData] = useState({
    amount: "",
    payment_date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "receivable" | "payable">("all");

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      if (typeFilter !== "all") {
        params.type = typeFilter;
      }

      const res = await apiClient.get("/trades", { params });
      setTransactions(res.data || []);

      // Her işlem için ödemeleri çek
      const paymentPromises = (res.data || []).map(async (tx: TradeTransaction) => {
        try {
          const paymentsRes = await apiClient.get(`/trades/${tx.id}/payments`);
          return { txId: tx.id, payments: paymentsRes.data || [] };
        } catch (err) {
          console.error(`İşlem ${tx.id} ödemeleri yüklenemedi:`, err);
          return { txId: tx.id, payments: [] };
        }
      });

      const paymentResults = await Promise.all(paymentPromises);
      const paymentsMap: { [key: number]: TradePayment[] } = {};
      paymentResults.forEach((result) => {
        paymentsMap[result.txId] = result.payments;
      });
      setPayments(paymentsMap);
    } catch (err) {
      console.error("İşlemler yüklenemedi:", err);
      alert("İşlemler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [user, selectedBranchId, typeFilter]);

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(transactionFormData.amount);

    if (!transactionFormData.amount || isNaN(amountNum) || amountNum <= 0) {
      alert("Lütfen geçerli bir tutar girin");
      return;
    }

    if (!transactionFormData.description.trim()) {
      alert("Lütfen açıklama girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        type: transactionFormData.type,
        amount: amountNum,
        description: transactionFormData.description.trim(),
        date: transactionFormData.date,
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/trades", payload);
      alert("İşlem başarıyla oluşturuldu");
      setTransactionFormData({
        type: "receivable",
        amount: "",
        description: "",
        date: new Date().toISOString().split("T")[0],
      });
      setShowTransactionForm(false);
      fetchTransactions();
    } catch (err: any) {
      alert(err.response?.data?.error || "İşlem oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransaction) return;

    const amountNum = parseFloat(paymentFormData.amount);

    if (!paymentFormData.amount || isNaN(amountNum) || amountNum <= 0) {
      alert("Lütfen geçerli bir tutar girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        trade_transaction_id: selectedTransaction.id,
        amount: amountNum,
        payment_date: paymentFormData.payment_date,
        description: paymentFormData.description.trim(),
      };

      await apiClient.post(`/trades/${selectedTransaction.id}/payments`, payload);
      alert("Ödeme başarıyla eklendi");
      setPaymentFormData({
        amount: "",
        payment_date: new Date().toISOString().split("T")[0],
        description: "",
      });
      setShowPaymentForm(false);
      setSelectedTransaction(null);
      fetchTransactions();
    } catch (err: any) {
      alert(err.response?.data?.error || "Ödeme eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTransaction = async (tx: TradeTransaction) => {
    if (!confirm(`Bu ${tx.type === "receivable" ? "alacak" : "verecek"} işlemini silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      await apiClient.delete(`/trades/${tx.id}`);
      alert("İşlem başarıyla silindi");
      fetchTransactions();
    } catch (err: any) {
      alert(err.response?.data?.error || "İşlem silinemedi");
    }
  };

  const handleDeletePayment = async (txId: number, paymentId: number) => {
    if (!confirm("Bu ödemeyi silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.delete(`/trades/${txId}/payments/${paymentId}`);
      alert("Ödeme başarıyla silindi");
      fetchTransactions();
    } catch (err: any) {
      alert(err.response?.data?.error || "Ödeme silinemedi");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const receivableTransactions = transactions.filter((tx) => tx.type === "receivable");
  const payableTransactions = transactions.filter((tx) => tx.type === "payable");

  return (
    <div className="space-y-6">
      {/* Başlık ve Filtre */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h1 className="text-2xl font-bold text-[#222222]">Ticaret İşlemleri</h1>
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | "receivable" | "payable")}
            className="px-4 py-2 bg-white border border-[#E5E5E5] rounded text-sm text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
          >
            <option value="all">Tümü</option>
            <option value="receivable">Alacaklar</option>
            <option value="payable">Verecekler</option>
          </select>
          <button
            onClick={() => setShowTransactionForm(true)}
            className="px-6 py-2 rounded-xl text-sm font-semibold transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
          >
            İşlem Oluştur
          </button>
        </div>
      </div>

      {/* İşlem Oluştur Modal */}
      <Modal
        isOpen={showTransactionForm}
        onClose={() => {
          setShowTransactionForm(false);
          setTransactionFormData({
            type: "receivable",
            amount: "",
            description: "",
            date: new Date().toISOString().split("T")[0],
          });
        }}
        title="Yeni İşlem Oluştur"
        maxWidth="md"
      >
        <form onSubmit={handleTransactionSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#222222] mb-2">
              İşlem Türü
            </label>
            <select
              value={transactionFormData.type}
              onChange={(e) =>
                setTransactionFormData({
                  ...transactionFormData,
                  type: e.target.value as "receivable" | "payable",
                })
              }
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              required
            >
              <option value="receivable">Alacak</option>
              <option value="payable">Verecek</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[#222222] mb-2">
              Tutar (TL)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={transactionFormData.amount}
              onChange={(e) =>
                setTransactionFormData({
                  ...transactionFormData,
                  amount: e.target.value,
                })
              }
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              placeholder="0.00"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#222222] mb-2">
              Açıklama
            </label>
            <textarea
              value={transactionFormData.description}
              onChange={(e) =>
                setTransactionFormData({
                  ...transactionFormData,
                  description: e.target.value,
                })
              }
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              rows={3}
              placeholder="İşlem açıklaması..."
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#222222] mb-2">
              Tarih
            </label>
            <input
              type="date"
              value={transactionFormData.date}
              onChange={(e) =>
                setTransactionFormData({
                  ...transactionFormData,
                  date: e.target.value,
                })
              }
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              required
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
            >
              {submitting ? "Oluşturuluyor..." : "Oluştur"}
            </button>
            <button
              type="button"
              onClick={() => setShowTransactionForm(false)}
              className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
            >
              İptal
            </button>
          </div>
        </form>
      </Modal>

      {/* Ödeme Ekle Modal */}
      <Modal
        isOpen={showPaymentForm && selectedTransaction !== null}
        onClose={() => {
          setShowPaymentForm(false);
          setSelectedTransaction(null);
          setPaymentFormData({
            amount: "",
            payment_date: new Date().toISOString().split("T")[0],
            description: "",
          });
        }}
        title={`Ödeme Ekle - ${selectedTransaction?.type === "receivable" ? "Alacak" : "Verecek"}`}
        maxWidth="md"
      >
        {selectedTransaction && (
          <div className="space-y-4">
            <div className="bg-[#F4F4F4] rounded-lg p-3">
              <div className="text-sm text-[#555555]">Toplam Tutar</div>
              <div className="text-lg font-semibold text-[#222222]">
                {formatCurrency(selectedTransaction.amount)}
              </div>
              <div className="text-sm text-[#555555] mt-1">
                Ödenen: {formatCurrency(selectedTransaction.total_paid)} / Kalan:{" "}
                {formatCurrency(selectedTransaction.remaining)}
              </div>
            </div>
            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#222222] mb-2">
                  Ödeme Tutarı (TL)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={selectedTransaction.remaining}
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
                <div className="text-xs text-[#555555] mt-1">
                  Maksimum: {formatCurrency(selectedTransaction.remaining)}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#222222] mb-2">
                  Ödeme Tarihi
                </label>
                <input
                  type="date"
                  value={paymentFormData.payment_date}
                  onChange={(e) =>
                    setPaymentFormData({
                      ...paymentFormData,
                      payment_date: e.target.value,
                    })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#222222] mb-2">
                  Açıklama (Taksit bilgisi vs.)
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
                  placeholder="Örn: 1. Taksit"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white"
                >
                  {submitting ? "Ekleniyor..." : "Ödeme Ekle"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentForm(false);
                    setSelectedTransaction(null);
                  }}
                  className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
                >
                  İptal
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>

      {loading ? (
        <div className="text-center py-8">Yükleniyor...</div>
      ) : (
        <div className="space-y-6">
          {/* Alacaklar */}
          {(typeFilter === "all" || typeFilter === "receivable") && (
            <div>
              <h2 className="text-xl font-bold text-green-700 mb-4">Alacaklar</h2>
              {receivableTransactions.length === 0 ? (
                <div className="bg-white border border-[#E5E5E5] rounded-lg p-6 text-center text-[#555555]">
                  Henüz alacak işlemi bulunmuyor
                </div>
              ) : (
                <div className="space-y-3">
                  {receivableTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="bg-white border border-green-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="font-semibold text-[#222222]">{tx.description}</h3>
                              <div className="text-sm text-[#555555] mt-1">{tx.date}</div>
                            </div>
                            <button
                              onClick={() => handleDeleteTransaction(tx)}
                              className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
                            >
                              Sil
                            </button>
                          </div>
                          <div className="mt-3">
                            <div className="text-lg font-bold text-green-700">
                              {formatCurrency(tx.total_paid)} / {formatCurrency(tx.amount)}
                            </div>
                            <div className="text-sm text-[#555555]">
                              Kalan: {formatCurrency(tx.remaining)}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {tx.remaining > 0 && (
                            <button
                              onClick={() => {
                                setSelectedTransaction(tx);
                                setShowPaymentForm(true);
                              }}
                              className="px-4 py-2 rounded text-sm font-medium transition-colors bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                            >
                              Ödeme Al
                            </button>
                          )}
                        </div>
                      </div>
                      {payments[tx.id] && payments[tx.id].length > 0 && (
                        <div className="mt-4 pt-4 border-t border-green-200">
                          <div className="text-sm font-medium text-[#555555] mb-2">Ödemeler:</div>
                          <div className="space-y-2">
                            {payments[tx.id].map((payment) => (
                              <div
                                key={payment.id}
                                className="flex items-center justify-between bg-green-50 rounded p-2"
                              >
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-[#222222]">
                                    {formatCurrency(payment.amount)}
                                  </div>
                                  <div className="text-xs text-[#555555]">
                                    {payment.payment_date}
                                    {payment.description && ` - ${payment.description}`}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleDeletePayment(tx.id, payment.id)}
                                  className="text-red-600 hover:text-red-800 text-xs px-2 py-1"
                                >
                                  Sil
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Verecekler */}
          {(typeFilter === "all" || typeFilter === "payable") && (
            <div>
              <h2 className="text-xl font-bold text-red-700 mb-4">Verecekler</h2>
              {payableTransactions.length === 0 ? (
                <div className="bg-white border border-[#E5E5E5] rounded-lg p-6 text-center text-[#555555]">
                  Henüz verecek işlemi bulunmuyor
                </div>
              ) : (
                <div className="space-y-3">
                  {payableTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="bg-white border border-red-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="font-semibold text-[#222222]">{tx.description}</h3>
                              <div className="text-sm text-[#555555] mt-1">{tx.date}</div>
                            </div>
                            <button
                              onClick={() => handleDeleteTransaction(tx)}
                              className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
                            >
                              Sil
                            </button>
                          </div>
                          <div className="mt-3">
                            <div className="text-lg font-bold text-red-700">
                              {formatCurrency(tx.total_paid)} / {formatCurrency(tx.amount)}
                            </div>
                            <div className="text-sm text-[#555555]">
                              Kalan: {formatCurrency(tx.remaining)}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {tx.remaining > 0 && (
                            <button
                              onClick={() => {
                                setSelectedTransaction(tx);
                                setShowPaymentForm(true);
                              }}
                              className="px-4 py-2 rounded text-sm font-medium transition-colors bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"
                            >
                              Ödeme Yap
                            </button>
                          )}
                        </div>
                      </div>
                      {payments[tx.id] && payments[tx.id].length > 0 && (
                        <div className="mt-4 pt-4 border-t border-red-200">
                          <div className="text-sm font-medium text-[#555555] mb-2">Ödemeler:</div>
                          <div className="space-y-2">
                            {payments[tx.id].map((payment) => (
                              <div
                                key={payment.id}
                                className="flex items-center justify-between bg-red-50 rounded p-2"
                              >
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-[#222222]">
                                    {formatCurrency(payment.amount)}
                                  </div>
                                  <div className="text-xs text-[#555555]">
                                    {payment.payment_date}
                                    {payment.description && ` - ${payment.description}`}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleDeletePayment(tx.id, payment.id)}
                                  className="text-red-600 hover:text-red-800 text-xs px-2 py-1"
                                >
                                  Sil
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

