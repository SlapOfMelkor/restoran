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

interface TradeTransactionWithLog extends TradeTransaction {
  created_by_user_id?: number;
  created_by_user_name?: string;
  log_id?: number;
  is_undone?: boolean;
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

interface TradePaymentWithLog extends TradePayment {
  created_by_user_id?: number;
  created_by_user_name?: string;
  log_id?: number;
  is_undone?: boolean;
}

interface Property {
  id: number;
  branch_id: number;
  name: string;
  value: number;
  description: string;
  created_at: string;
  updated_at: string;
}

interface PropertyWithLog extends Property {
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

type TabType = "trades" | "properties";

export const TradesPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [transactions, setTransactions] = useState<TradeTransactionWithLog[]>([]);
  const [payments, setPayments] = useState<{ [key: number]: TradePaymentWithLog[] }>({});
  const [loading, setLoading] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TradeTransactionWithLog | null>(null);
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
  const [activeTab, setActiveTab] = useState<TabType>("trades");
  
  // Property states
  const [properties, setProperties] = useState<PropertyWithLog[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [propertyFormData, setPropertyFormData] = useState({
    name: "",
    value: "",
    description: "",
  });

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
      
      // Audit log'ları çek
      const logParams: any = {
        entity_type: "trade_transaction",
      };
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          logParams.branch_id = selectedBranchId;
        }
      } else if (user?.role === "branch_admin" && user.branch_id) {
        logParams.branch_id = user.branch_id;
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });
      
      // Transaction'ları log'larla birleştir
      const transactionsWithLogs: TradeTransactionWithLog[] = (res.data || []).map((tx: TradeTransaction) => {
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "trade_transaction" &&
            log.entity_id === tx.id &&
            log.action === "create"
        );
        
        return {
          ...tx,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });
      
      setTransactions(transactionsWithLogs);

      // Her işlem için ödemeleri çek
      const paymentPromises = (res.data || []).map(async (tx: TradeTransaction) => {
        try {
          const paymentsRes = await apiClient.get(`/trades/${tx.id}/payments`);
          
          // Ödemeler için audit log'ları çek
          const paymentLogParams: any = {
            entity_type: "trade_payment",
          };
          if (user?.role === "super_admin") {
            if (selectedBranchId) {
              paymentLogParams.branch_id = selectedBranchId;
            }
          } else if (user?.role === "branch_admin" && user.branch_id) {
            paymentLogParams.branch_id = user.branch_id;
          }
          const paymentLogsRes = await apiClient.get("/audit-logs", { params: paymentLogParams });
          
          // Payment'ları log'larla birleştir
          const paymentsWithLogs: TradePaymentWithLog[] = (paymentsRes.data || []).map((payment: TradePayment) => {
            const createLog = paymentLogsRes.data.find(
              (log: AuditLog) =>
                log.entity_type === "trade_payment" &&
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
          
          return { txId: tx.id, payments: paymentsWithLogs };
        } catch (err) {
          console.error(`İşlem ${tx.id} ödemeleri yüklenemedi:`, err);
          return { txId: tx.id, payments: [] };
        }
      });

      const paymentResults = await Promise.all(paymentPromises);
      const paymentsMap: { [key: number]: TradePaymentWithLog[] } = {};
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
    if (activeTab === "trades") {
      fetchTransactions();
    } else {
      fetchProperties();
    }
  }, [user, selectedBranchId, typeFilter, activeTab]);

  const fetchProperties = async () => {
    setLoadingProperties(true);
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/properties", { params });
      
      // Audit log'ları çek
      const logParams: any = {
        entity_type: "property",
      };
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          logParams.branch_id = selectedBranchId;
        }
      } else if (user?.role === "branch_admin" && user.branch_id) {
        logParams.branch_id = user.branch_id;
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });
      
      // Property'leri log'larla birleştir
      const propertiesWithLogs: PropertyWithLog[] = (res.data || []).map((prop: Property) => {
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "property" &&
            log.entity_id === prop.id &&
            log.action === "create"
        );
        
        return {
          ...prop,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });
      
      setProperties(propertiesWithLogs);
    } catch (err) {
      console.error("Mal mülkler yüklenemedi:", err);
      alert("Mal mülkler yüklenemedi");
    } finally {
      setLoadingProperties(false);
    }
  };

  const handlePropertySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const valueNum = parseFloat(propertyFormData.value);

    if (!propertyFormData.name.trim()) {
      alert("Lütfen isim girin");
      return;
    }

    if (!propertyFormData.value || isNaN(valueNum) || valueNum < 0) {
      alert("Lütfen geçerli bir değer girin (0 veya daha büyük)");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        name: propertyFormData.name.trim(),
        value: valueNum,
        description: propertyFormData.description.trim(),
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      if (editingProperty) {
        await apiClient.put(`/properties/${editingProperty.id}`, payload);
        alert("Mal mülk başarıyla güncellendi");
      } else {
        await apiClient.post("/properties", payload);
        alert("Mal mülk başarıyla oluşturuldu");
      }

      setPropertyFormData({
        name: "",
        value: "",
        description: "",
      });
      setShowPropertyForm(false);
      setEditingProperty(null);
      fetchProperties();
    } catch (err: any) {
      alert(err.response?.data?.error || "Mal mülk kaydedilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProperty = async (property: Property) => {
    if (!confirm(`Bu mal mülkü (${property.name}) silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      await apiClient.delete(`/properties/${property.id}`);
      alert("Mal mülk başarıyla silindi");
      fetchProperties();
    } catch (err: any) {
      alert(err.response?.data?.error || "Mal mülk silinemedi");
    }
  };

  const handleEditProperty = (property: Property) => {
    setEditingProperty(property);
    setPropertyFormData({
      name: property.name,
      value: property.value.toString(),
      description: property.description || "",
    });
    setShowPropertyForm(true);
  };

  // Geri Alma Fonksiyonları
  const handleUndoTransaction = async (logId: number, _txId: number) => {
    if (!confirm("Bu işlemi geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("İşlem başarıyla geri alındı");
      fetchTransactions();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const handleUndoPayment = async (logId: number, _paymentId: number) => {
    if (!confirm("Bu ödemeyi geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("Ödeme başarıyla geri alındı");
      fetchTransactions();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const handleUndoProperty = async (logId: number, _propertyId: number) => {
    if (!confirm("Bu mal mülk kaydını geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("Mal mülk kaydı başarıyla geri alındı");
      fetchProperties();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const canUndoTransaction = (tx: TradeTransactionWithLog): boolean => {
    if (!tx.log_id || tx.is_undone) {
      return false;
    }
    if (user?.role === "super_admin") {
      return true;
    }
    if (user?.role === "branch_admin" && user.branch_id) {
      return tx.branch_id === user.branch_id;
    }
    return false;
  };

  const canUndoPayment = (payment: TradePaymentWithLog): boolean => {
    if (!payment.log_id || payment.is_undone) {
      return false;
    }
    if (user?.role === "super_admin") {
      return true;
    }
    if (user?.role === "branch_admin" && user.branch_id) {
      return payment.branch_id === user.branch_id;
    }
    return false;
  };

  const canUndoProperty = (property: PropertyWithLog): boolean => {
    if (!property.log_id || property.is_undone) {
      return false;
    }
    if (user?.role === "super_admin") {
      return true;
    }
    if (user?.role === "branch_admin" && user.branch_id) {
      return property.branch_id === user.branch_id;
    }
    return false;
  };

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

  // Toplam hesaplamaları
  const totalReceivable = receivableTransactions.reduce((sum, tx) => sum + tx.remaining, 0);
  const totalPayable = payableTransactions.reduce((sum, tx) => sum + tx.remaining, 0);
  const totalPropertyValue = properties.reduce((sum, p) => sum + p.value, 0);
  const netReceivable = totalReceivable - totalPayable;

  return (
    <div className="space-y-6">
      {/* Başlık ve Tab'lar */}
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-[#222222]">Ticaret</h1>
        
        {/* Özet Kartları */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Toplam Alacak */}
          <div className="bg-white border border-green-200 rounded-lg p-4">
            <div className="text-sm text-[#555555] mb-1">Toplam Alacak</div>
            <div className="text-2xl font-bold text-green-700">
              {formatCurrency(totalReceivable)}
            </div>
            <div className="text-xs text-[#777777] mt-1">
              {receivableTransactions.length} işlem
            </div>
          </div>

          {/* Toplam Verecek */}
          <div className="bg-white border border-red-200 rounded-lg p-4">
            <div className="text-sm text-[#555555] mb-1">Toplam Verecek</div>
            <div className="text-2xl font-bold text-red-700">
              {formatCurrency(totalPayable)}
            </div>
            <div className="text-xs text-[#777777] mt-1">
              {payableTransactions.length} işlem
            </div>
          </div>

          {/* Net Alacak */}
          <div className={`bg-white border rounded-lg p-4 ${
            netReceivable >= 0 ? 'border-blue-200' : 'border-orange-200'
          }`}>
            <div className="text-sm text-[#555555] mb-1">Net Alacak</div>
            <div className={`text-2xl font-bold ${
              netReceivable >= 0 ? 'text-blue-700' : 'text-orange-700'
            }`}>
              {formatCurrency(netReceivable)}
            </div>
            <div className="text-xs text-[#777777] mt-1">
              {netReceivable >= 0 ? 'Alacaklı' : 'Borçlu'}
            </div>
          </div>

          {/* Toplam Mal Mülk */}
          <div className="bg-white border border-[#8F1A9F] rounded-lg p-4">
            <div className="text-sm text-[#555555] mb-1">Toplam Mal Mülk</div>
            <div className="text-2xl font-bold text-[#8F1A9F]">
              {formatCurrency(totalPropertyValue)}
            </div>
            <div className="text-xs text-[#777777] mt-1">
              {properties.length} kayıt
            </div>
          </div>
        </div>
        
        {/* Tab Butonları */}
        <div className="flex gap-2 border-b border-[#E5E5E5]">
          <button
            onClick={() => setActiveTab("trades")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "trades"
                ? "text-[#8F1A9F] border-b-2 border-[#8F1A9F]"
                : "text-[#555555] hover:text-[#222222]"
            }`}
          >
            Alacak/Verecek
          </button>
          <button
            onClick={() => setActiveTab("properties")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "properties"
                ? "text-[#8F1A9F] border-b-2 border-[#8F1A9F]"
                : "text-[#555555] hover:text-[#222222]"
            }`}
          >
            Mal Mülk
          </button>
        </div>
      </div>

      {/* Ticaret İşlemleri Tab */}
      {activeTab === "trades" && (
        <>
      {/* Başlık ve Filtre */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-[#222222]">{tx.description}</h3>
                                {tx.is_undone && (
                                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                                    (Geri Alındı)
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-[#555555] mt-1">{tx.date}</div>
                              {tx.created_by_user_name && (
                                <div className="text-xs text-[#777777] mt-1">
                                  {tx.created_by_user_name} tarafından oluşturuldu
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {tx.log_id && canUndoTransaction(tx) && (
                                <button
                                  onClick={() => handleUndoTransaction(tx.log_id!, tx.id)}
                                  className="text-orange-600 hover:text-orange-800 text-sm px-2 py-1"
                                  title="Geri Al"
                                >
                                  Geri Al
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteTransaction(tx)}
                                className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
                              >
                                Sil
                              </button>
                            </div>
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
                          {tx.remaining > 0 && !tx.is_undone && (
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
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm font-medium text-[#222222]">
                                      {formatCurrency(payment.amount)}
                                    </div>
                                    {payment.is_undone && (
                                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                                        (Geri Alındı)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-[#555555]">
                                    {payment.payment_date}
                                    {payment.description && ` - ${payment.description}`}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  {payment.log_id && canUndoPayment(payment) && (
                                    <button
                                      onClick={() => handleUndoPayment(payment.log_id!, payment.id)}
                                      className="text-orange-600 hover:text-orange-800 text-xs px-2 py-1"
                                      title="Geri Al"
                                    >
                                      Geri Al
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeletePayment(tx.id, payment.id)}
                                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1"
                                  >
                                    Sil
                                  </button>
                                </div>
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
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-[#222222]">{tx.description}</h3>
                                {tx.is_undone && (
                                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                                    (Geri Alındı)
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-[#555555] mt-1">{tx.date}</div>
                              {tx.created_by_user_name && (
                                <div className="text-xs text-[#777777] mt-1">
                                  {tx.created_by_user_name} tarafından oluşturuldu
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {tx.log_id && canUndoTransaction(tx) && (
                                <button
                                  onClick={() => handleUndoTransaction(tx.log_id!, tx.id)}
                                  className="text-orange-600 hover:text-orange-800 text-sm px-2 py-1"
                                  title="Geri Al"
                                >
                                  Geri Al
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteTransaction(tx)}
                                className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
                              >
                                Sil
                              </button>
                            </div>
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
                          {tx.remaining > 0 && !tx.is_undone && (
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
                                  <div className="flex items-center gap-2">
                                    <div className="text-sm font-medium text-[#222222]">
                                      {formatCurrency(payment.amount)}
                                    </div>
                                    {payment.is_undone && (
                                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                                        (Geri Alındı)
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-[#555555]">
                                    {payment.payment_date}
                                    {payment.description && ` - ${payment.description}`}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  {payment.log_id && canUndoPayment(payment) && (
                                    <button
                                      onClick={() => handleUndoPayment(payment.log_id!, payment.id)}
                                      className="text-orange-600 hover:text-orange-800 text-xs px-2 py-1"
                                      title="Geri Al"
                                    >
                                      Geri Al
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDeletePayment(tx.id, payment.id)}
                                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1"
                                  >
                                    Sil
                                  </button>
                                </div>
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
        </>
      )}

      {/* Mal Mülk Tab */}
      {activeTab === "properties" && (
        <>
          {/* Başlık ve Buton */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <h2 className="text-xl font-bold text-[#222222]">Mal Mülk</h2>
            <button
              onClick={() => {
                setEditingProperty(null);
                setPropertyFormData({
                  name: "",
                  value: "",
                  description: "",
                });
                setShowPropertyForm(true);
              }}
              className="px-6 py-2 rounded-xl text-sm font-semibold transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
            >
              Mal Mülk Ekle
            </button>
          </div>

          {/* Mal Mülk Form Modal */}
          <Modal
            isOpen={showPropertyForm}
            onClose={() => {
              setShowPropertyForm(false);
              setEditingProperty(null);
              setPropertyFormData({
                name: "",
                value: "",
                description: "",
              });
            }}
            title={editingProperty ? "Mal Mülk Düzenle" : "Yeni Mal Mülk Ekle"}
            maxWidth="md"
          >
            <form onSubmit={handlePropertySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#222222] mb-2">
                  İsim *
                </label>
                <input
                  type="text"
                  value={propertyFormData.name}
                  onChange={(e) =>
                    setPropertyFormData({
                      ...propertyFormData,
                      name: e.target.value,
                    })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  placeholder="Örn: Dükkan, Araç, Makine..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#222222] mb-2">
                  Değer (TL) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={propertyFormData.value}
                  onChange={(e) =>
                    setPropertyFormData({
                      ...propertyFormData,
                      value: e.target.value,
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
                  value={propertyFormData.description}
                  onChange={(e) =>
                    setPropertyFormData({
                      ...propertyFormData,
                      description: e.target.value,
                    })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  rows={3}
                  placeholder="Mal mülk hakkında açıklama..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
                >
                  {submitting
                    ? (editingProperty ? "Güncelleniyor..." : "Oluşturuluyor...")
                    : (editingProperty ? "Güncelle" : "Oluştur")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPropertyForm(false);
                    setEditingProperty(null);
                    setPropertyFormData({
                      name: "",
                      value: "",
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

          {/* Mal Mülk Listesi */}
          {loadingProperties ? (
            <div className="text-center py-8">Yükleniyor...</div>
          ) : (
            <div className="space-y-3">
              {properties.length === 0 ? (
                <div className="bg-white border border-[#E5E5E5] rounded-lg p-6 text-center text-[#555555]">
                  Henüz mal mülk kaydı bulunmuyor
                </div>
              ) : (
                <>
                  {/* Mal Mülk Kartları */}
                  {properties.map((property) => (
                    <div
                      key={property.id}
                      className="bg-white border border-[#E5E5E5] rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-[#222222] text-lg">
                                  {property.name}
                                </h3>
                                {property.is_undone && (
                                  <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                                    (Geri Alındı)
                                  </span>
                                )}
                              </div>
                              {property.description && (
                                <div className="text-sm text-[#555555] mt-1">
                                  {property.description}
                                </div>
                              )}
                              {property.created_by_user_name && (
                                <div className="text-xs text-[#777777] mt-1">
                                  {property.created_by_user_name} tarafından oluşturuldu
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="mt-3">
                            <div className="text-xl font-bold text-[#8F1A9F]">
                              {formatCurrency(property.value)}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          {!property.is_undone && (
                            <>
                              <button
                                onClick={() => handleEditProperty(property)}
                                className="px-4 py-2 rounded text-sm font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
                              >
                                Düzenle
                              </button>
                              <button
                                onClick={() => handleDeleteProperty(property)}
                                className="px-4 py-2 rounded text-sm font-medium transition-colors bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"
                              >
                                Sil
                              </button>
                            </>
                          )}
                          {property.log_id && canUndoProperty(property) && (
                            <button
                              onClick={() => handleUndoProperty(property.log_id!, property.id)}
                              className="px-4 py-2 rounded text-sm font-medium transition-colors bg-orange-600 hover:bg-orange-700 text-white whitespace-nowrap"
                            >
                              Geri Al
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

