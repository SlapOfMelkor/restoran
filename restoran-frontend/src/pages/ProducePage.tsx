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
  supplier_id: number;
  supplier_name?: string;
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
  supplier_id: number;
  supplier_name?: string;
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

interface ProduceWaste {
  id: number;
  branch_id: number;
  supplier_id: number;
  supplier_name?: string;
  product_id: number;
  product_name: string;
  purchase_id?: number | null;
  quantity: number;
  date: string;
  description: string;
  created_at: string;
}

interface ProduceWasteWithLog extends ProduceWaste {
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

interface ProduceSupplier {
  id: number;
  branch_id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export const ProducePage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<ProduceSupplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<ProduceSupplier | null>(null);
  const [showSupplierSelector, setShowSupplierSelector] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [supplierFormData, setSupplierFormData] = useState({
    name: "",
    description: "",
  });
  const [purchases, setPurchases] = useState<ProducePurchaseWithLog[]>([]);
  const [payments, setPayments] = useState<ProducePaymentWithLog[]>([]);
  const [wastes, setWastes] = useState<ProduceWasteWithLog[]>([]);
  const [balance, setBalance] = useState<ProduceBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showWasteForm, setShowWasteForm] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [showPurchasesModal, setShowPurchasesModal] = useState(false);
  const [showPaymentsModal, setShowPaymentsModal] = useState(false);
  const [showWastesModal, setShowWastesModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productFormData, setProductFormData] = useState({
    name: "",
    unit: "",
    stock_code: "",
  });
  const [purchaseFormData, setPurchaseFormData] = useState({
    supplier_id: "",
    product_id: "",
    quantity: "",
    unit_price: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [paymentFormData, setPaymentFormData] = useState({
    supplier_id: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [wasteFormData, setWasteFormData] = useState({
    supplier_id: "",
    product_id: "",
    purchase_id: "",
    quantity: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchSuppliers = async () => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/produce-suppliers", { params });
      setSuppliers(res.data || []);
      
      // Eğer hiç supplier yoksa, selector'ı göster ve oluşturmayı mecbur kıl
      if ((res.data || []).length === 0) {
        setShowSupplierSelector(true);
      } else {
        // LocalStorage'dan seçili supplier'ı yükle
        const savedSupplierId = localStorage.getItem("selectedProduceSupplierId");
        if (savedSupplierId) {
          const supplier = (res.data || []).find((s: ProduceSupplier) => s.id.toString() === savedSupplierId);
          if (supplier) {
            setSelectedSupplier(supplier);
            setShowSupplierSelector(false);
          } else {
            // Kayıtlı supplier bulunamadı, ilk supplier'ı seç
            setSelectedSupplier(res.data[0]);
            localStorage.setItem("selectedProduceSupplierId", res.data[0].id.toString());
            setShowSupplierSelector(false);
          }
        } else {
          // İlk supplier'ı otomatik seç
          setSelectedSupplier(res.data[0]);
          localStorage.setItem("selectedProduceSupplierId", res.data[0].id.toString());
          setShowSupplierSelector(false);
        }
      }
    } catch (err) {
      console.error("Tedarikçiler yüklenemedi:", err);
      setSuppliers([]);
      setShowSupplierSelector(true);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await apiClient.get("/produce-products");
      console.log("Manav ürünleri yüklendi:", res.data);
      setProducts(res.data || []);
    } catch (err) {
      console.error("Manav ürünleri yüklenemedi:", err);
      setProducts([]);
    }
  };


  const fetchPurchases = async () => {
    if (!selectedSupplier) return;
    
    setLoading(true);
    try {
      const params: any = {
        supplier_id: selectedSupplier.id,
      };
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
    if (!selectedSupplier) return;
    
    try {
      const params: any = {
        supplier_id: selectedSupplier.id,
      };
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
    if (!selectedSupplier) return;
    
    try {
      const params: any = {
        supplier_id: selectedSupplier.id,
      };
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/produce-purchases/balance", { params });
      setBalance(res.data);
    } catch (err) {
      console.error("Borç bilgisi yüklenemedi:", err);
    }
  };

  const fetchWastes = async () => {
    if (!selectedSupplier) return;
    
    setLoading(true);
    try {
      const params: any = {
        supplier_id: selectedSupplier.id,
      };
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const wastesRes = await apiClient.get("/produce-waste", { params });
      
      // Audit log'ları çek
      const logParams: any = {
        entity_type: "produce_waste",
      };
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          logParams.branch_id = selectedBranchId;
        }
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });
      
      // Waste'leri log'larla birleştir
      const wastesWithLogs: ProduceWasteWithLog[] = wastesRes.data.map((waste: ProduceWaste) => {
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "produce_waste" &&
            log.entity_id === waste.id &&
            log.action === "create"
        );
        
        return {
          ...waste,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          created_at: createLog?.created_at,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });
      
      setWastes(wastesWithLogs);
    } catch (err) {
      console.error("Zayiat kayıtları yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  // Önce supplier'ları yükle
  useEffect(() => {
    fetchSuppliers();
    fetchProducts();
  }, [user, selectedBranchId]);

  // Supplier seçildiğinde diğer verileri yükle
  useEffect(() => {
    if (selectedSupplier) {
      fetchPurchases();
      fetchPayments();
      fetchWastes();
      fetchBalance();
    }
  }, [selectedSupplier, user, selectedBranchId]);

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

    if (!selectedSupplier) {
      alert("Lütfen önce bir tedarikçi seçin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        supplier_id: selectedSupplier.id,
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

    if (!selectedSupplier) {
      alert("Lütfen önce bir tedarikçi seçin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        supplier_id: selectedSupplier.id,
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
        supplier_id: selectedSupplier?.id.toString() || "",
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

  const handleWasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const quantityNum = parseFloat(wasteFormData.quantity);
    
    if (!wasteFormData.product_id || !wasteFormData.quantity || isNaN(quantityNum) || quantityNum <= 0) {
      alert("Lütfen ürün seçin ve geçerli bir miktar girin");
      return;
    }

    if (!selectedSupplier) {
      alert("Lütfen önce bir tedarikçi seçin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        supplier_id: selectedSupplier.id,
        product_id: parseInt(wasteFormData.product_id),
        quantity: quantityNum,
        date: wasteFormData.date,
        description: wasteFormData.description,
      };

      if (wasteFormData.purchase_id && wasteFormData.purchase_id !== "") {
        payload.purchase_id = parseInt(wasteFormData.purchase_id);
      }

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/produce-waste", payload);
      alert("Zayiat kaydı başarıyla eklendi");
      setWasteFormData({
        supplier_id: selectedSupplier?.id.toString() || "",
        product_id: "",
        purchase_id: "",
        quantity: "",
        date: new Date().toISOString().split("T")[0],
        description: "",
      });
      setShowWasteForm(false);
      fetchWastes();
    } catch (err: any) {
      alert(err.response?.data?.error || "Zayiat kaydı eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndoWaste = async (logId: number, _wasteId: number) => {
    if (!confirm("Bu zayiat kaydını geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("Zayiat kaydı başarıyla geri alındı");
      await fetchWastes();
      setShowWastesModal(false);
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const canUndoWaste = (waste: ProduceWasteWithLog): boolean => {
    if (!waste.log_id || waste.is_undone) {
      return false;
    }
    if (user?.role === "super_admin") {
      return true;
    }
    // Branch admin kendi şubesindeki tüm kayıtları geri alabilir
    if (user?.role === "branch_admin" && user.branch_id) {
      return waste.branch_id === user.branch_id;
    }
    return false;
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
      setShowPurchasesModal(false);
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
      setShowPaymentsModal(false);
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
    // Branch admin kendi şubesindeki tüm kayıtları geri alabilir
    if (user?.role === "branch_admin" && user.branch_id) {
      return purchase.branch_id === user.branch_id;
    }
    return false;
  };

  const canUndoPayment = (payment: ProducePaymentWithLog): boolean => {
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

  const handleSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierFormData.name.trim()) {
      alert("Lütfen tedarikçi ismi girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        name: supplierFormData.name.trim(),
        description: supplierFormData.description.trim(),
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/produce-suppliers", payload);
      alert("Tedarikçi başarıyla oluşturuldu");
      setSupplierFormData({ name: "", description: "" });
      setShowSupplierForm(false);
      await fetchSuppliers();
      setShowSupplierSelector(true); // Yeni oluşturulan supplier'ı seçmek için selector'ı göster
    } catch (err: any) {
      alert(err.response?.data?.error || "Tedarikçi oluşturulamadı");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectSupplier = (supplier: ProduceSupplier) => {
    setSelectedSupplier(supplier);
    localStorage.setItem("selectedProduceSupplierId", supplier.id.toString());
    setShowSupplierSelector(false);
    // Sayfa yenileniyor gibi davranış için verileri yeniden yükle
    window.location.reload();
  };

  const handleDeleteSupplier = async (supplier: ProduceSupplier, e: React.MouseEvent) => {
    e.stopPropagation(); // Parent div'in onClick'ini engelle
    
    if (!confirm(`Bu tedarikçiyi (${supplier.name}) ve tüm kayıtlarını (alımlar, ödemeler, zayiat) silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`)) {
      return;
    }

    try {
      await apiClient.delete(`/produce-suppliers/${supplier.id}`);
      alert("Tedarikçi ve tüm kayıtları başarıyla silindi");
      
      // Eğer silinen supplier seçili supplier ise, seçimi temizle
      if (selectedSupplier?.id === supplier.id) {
        setSelectedSupplier(null);
        localStorage.removeItem("selectedProduceSupplierId");
      }
      
      await fetchSuppliers();
      
      // Eğer başka supplier yoksa, selector'ı göster
      const remainingSuppliers = suppliers.filter(s => s.id !== supplier.id);
      if (remainingSuppliers.length === 0) {
        setShowSupplierSelector(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || "Tedarikçi silinemedi");
    }
  };

  return (
    <div className="space-y-4">
      {/* Supplier Seçim Modal */}
      <Modal
        isOpen={showSupplierSelector}
        onClose={() => {
          // Hiç supplier yoksa kapatmaya izin verme
          if (suppliers.length === 0) {
            return;
          }
          setShowSupplierSelector(false);
        }}
        title={suppliers.length === 0 ? "Manav Tedarikçisi Oluştur" : "Manav Tedarikçisi Seç"}
        maxWidth="md"
      >
        <div className="space-y-4">
          {/* Supplier Listesi */}
          {suppliers.length > 0 && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#222222] mb-2">
                Mevcut Tedarikçiler:
              </label>
              {suppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-[#8F1A9F] hover:bg-gray-50"
                >
                  <div 
                    onClick={() => handleSelectSupplier(supplier)}
                    className="flex-1 cursor-pointer"
                  >
                    <div className="font-medium text-sm">{supplier.name}</div>
                    {supplier.description && (
                      <div className="text-xs text-gray-500">{supplier.description}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleSelectSupplier(supplier)}
                      className="px-4 py-2 rounded text-sm font-medium transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
                    >
                      Seç
                    </button>
                    <button
                      onClick={(e) => handleDeleteSupplier(supplier, e)}
                      className="px-4 py-2 rounded text-sm font-medium transition-colors bg-red-600 hover:bg-red-700 text-white"
                      title="Tedarikçiyi ve tüm kayıtlarını sil"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Supplier Oluşturma Formu */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-[#222222]">
                {suppliers.length === 0 ? "İlk Tedarikçiyi Oluşturun:" : "Yeni Tedarikçi Ekle:"}
              </label>
              <button
                onClick={() => {
                  setShowSupplierForm(!showSupplierForm);
                  setSupplierFormData({ name: "", description: "" });
                }}
                className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 rounded text-gray-700"
              >
                {showSupplierForm ? "İptal" : "+ Yeni Tedarikçi"}
              </button>
            </div>

            {showSupplierForm && (
              <form onSubmit={handleSupplierSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-[#222222] mb-1">
                    İsim *
                  </label>
                  <input
                    type="text"
                    value={supplierFormData.name}
                    onChange={(e) =>
                      setSupplierFormData({ ...supplierFormData, name: e.target.value })
                    }
                    className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                    placeholder="Tedarikçi ismi..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#222222] mb-1">
                    Açıklama
                  </label>
                  <textarea
                    value={supplierFormData.description}
                    onChange={(e) =>
                      setSupplierFormData({ ...supplierFormData, description: e.target.value })
                    }
                    className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                    rows={2}
                    placeholder="Açıklama (opsiyonel)..."
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full px-4 py-2 rounded text-sm font-medium transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] disabled:opacity-50 text-white"
                >
                  {submitting ? "Oluşturuluyor..." : "Tedarikçi Oluştur"}
                </button>
              </form>
            )}
          </div>
        </div>
      </Modal>

      {/* Ana Sayfa İçeriği - Sadece supplier seçildiyse göster */}
      {selectedSupplier && (
        <>
      {/* Başlık ve Supplier Değiştirme Butonu */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-[#222222]">
          Manav - {selectedSupplier.name}
        </h1>
        <button
          onClick={() => setShowSupplierSelector(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white"
        >
          Tedarikçi Değiştir
        </button>
      </div>

      <div className="flex items-center justify-center py-4 md:py-8">
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 w-full max-w-md md:max-w-none px-4 md:px-0 md:flex-wrap md:justify-center">
          <button
            onClick={() => {
              setEditingProduct(null);
              setProductFormData({ name: "", unit: "", stock_code: "" });
              setShowProductModal(true);
            }}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Ürün Yönetimi
          </button>
          <button
            onClick={() => {
              if (!selectedSupplier) {
                alert("Lütfen önce bir tedarikçi seçin");
                setShowSupplierSelector(true);
                return;
              }
              setPurchaseFormData({
                supplier_id: selectedSupplier.id.toString(),
                product_id: "",
                quantity: "",
                unit_price: "",
                date: new Date().toISOString().split("T")[0],
                description: "",
              });
              setShowPurchaseForm(true);
            }}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Alım Ekle
          </button>
          <button
            onClick={() => {
              if (!selectedSupplier) {
                alert("Lütfen önce bir tedarikçi seçin");
                setShowSupplierSelector(true);
                return;
              }
              setPaymentFormData({
                supplier_id: selectedSupplier.id.toString(),
                amount: "",
                date: new Date().toISOString().split("T")[0],
                description: "",
              });
              setShowPaymentForm(true);
            }}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Ödeme Ekle
          </button>
          <button
            onClick={() => {
              if (!selectedSupplier) {
                alert("Lütfen önce bir tedarikçi seçin");
                setShowSupplierSelector(true);
                return;
              }
              setWasteFormData({
                supplier_id: selectedSupplier.id.toString(),
                product_id: "",
                purchase_id: "",
                quantity: "",
                date: new Date().toISOString().split("T")[0],
                description: "",
              });
              setShowWasteForm(true);
            }}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-red-600 hover:bg-red-700 text-white shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Zayiat Ekle
          </button>
          <button
            onClick={() => setShowPurchasesModal(true)}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Alım Kayıtları
          </button>
          <button
            onClick={() => setShowPaymentsModal(true)}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Ödeme Kayıtları
          </button>
          <button
            onClick={() => {
              fetchWastes();
              setShowWastesModal(true);
            }}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Zayiat Kayıtları
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
                  value={purchaseFormData.date || new Date().toISOString().split("T")[0]}
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
                  value={paymentFormData.date || new Date().toISOString().split("T")[0]}
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

      {/* Zayiat Formu */}
      <Modal
        isOpen={showWasteForm}
        onClose={() => {
          setShowWasteForm(false);
          setWasteFormData({
            product_id: "",
            purchase_id: "",
            quantity: "",
            date: new Date().toISOString().split("T")[0],
            description: "",
          });
        }}
        title="Yeni Zayiat Kaydı"
        maxWidth="md"
      >
        <form onSubmit={handleWasteSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[#555555] mb-1">
              Ürün
            </label>
            <select
              value={wasteFormData.product_id}
              onChange={(e) =>
                setWasteFormData({
                  ...wasteFormData,
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
          <div>
            <label className="block text-xs text-[#555555] mb-1">
              Alım Kaydı (Opsiyonel)
            </label>
            <select
              value={wasteFormData.purchase_id}
              onChange={(e) =>
                setWasteFormData({
                  ...wasteFormData,
                  purchase_id: e.target.value,
                })
              }
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              disabled={!wasteFormData.product_id}
            >
              <option value="">{wasteFormData.product_id ? "Alım kaydı seçin (opsiyonel)..." : "Önce ürün seçin"}</option>
              {wasteFormData.product_id && purchases
                .filter((p) => !p.is_undone && p.product_id === parseInt(wasteFormData.product_id))
                .map((purchase) => (
                  <option key={purchase.id} value={purchase.id}>
                    {purchase.product_name} - {purchase.quantity} {purchase.product_unit} - {purchase.date} ({purchase.total_amount.toFixed(2)} TL)
                  </option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Miktar
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={wasteFormData.quantity}
                onChange={(e) =>
                  setWasteFormData({
                    ...wasteFormData,
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
                Tarih
              </label>
              <input
                type="date"
                value={wasteFormData.date || new Date().toISOString().split("T")[0]}
                onChange={(e) =>
                  setWasteFormData({
                    ...wasteFormData,
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
              value={wasteFormData.description}
              onChange={(e) =>
                setWasteFormData({
                  ...wasteFormData,
                  description: e.target.value,
                })
              }
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              placeholder="Örn: çürük çıktı, bozuldu"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 rounded text-sm transition-colors bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white"
            >
              {submitting ? "Ekleniyor..." : "Ekle"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowWasteForm(false);
                setWasteFormData({
                  product_id: "",
                  purchase_id: "",
                  quantity: "",
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

      {/* Alım Kayıtları Modal */}
      <Modal
        isOpen={showPurchasesModal}
        onClose={() => setShowPurchasesModal(false)}
        title="Alım Kayıtları"
        maxWidth="lg"
      >
        <div className="space-y-4">
          {purchases.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-[#555555]">Toplam Alım:</span>
              <span className="text-sm font-bold text-blue-600">
                {purchases.reduce((sum, p) => sum + p.total_amount, 0).toFixed(2)} TL
              </span>
            </div>
          )}
          {loading ? (
            <p className="text-xs text-[#222222]">Yükleniyor...</p>
          ) : purchases.length === 0 ? (
            <p className="text-xs text-[#222222]">Henüz alım kaydı yok</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
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
                          onClick={() => handleUndoPurchase(purchase.log_id!, purchase.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors whitespace-nowrap text-white"
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
      </Modal>

      {/* Ödeme Kayıtları Modal */}
      <Modal
        isOpen={showPaymentsModal}
        onClose={() => setShowPaymentsModal(false)}
        title="Ödeme Kayıtları"
        maxWidth="lg"
      >
        <div className="space-y-4">
          {payments.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-[#555555]">Toplam Ödeme:</span>
              <span className="text-sm font-bold text-green-600">
                {payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2)} TL
              </span>
            </div>
          )}
          {loading ? (
            <p className="text-xs text-[#222222]">Yükleniyor...</p>
          ) : payments.length === 0 ? (
            <p className="text-xs text-[#222222]">Henüz ödeme kaydı yok</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
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
                          onClick={() => handleUndoPayment(payment.log_id!, payment.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors whitespace-nowrap text-white"
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
      </Modal>

      {/* Zayiat Kayıtları Modal */}
      <Modal
        isOpen={showWastesModal}
        onClose={() => setShowWastesModal(false)}
        title="Zayiat Kayıtları"
        maxWidth="lg"
      >
        <div className="space-y-4">
          {loading ? (
            <p className="text-xs text-[#222222]">Yükleniyor...</p>
          ) : wastes.length === 0 ? (
            <p className="text-xs text-[#222222]">Henüz zayiat kaydı yok</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {wastes.map((waste) => (
                <div
                  key={waste.id}
                  className={`p-3 bg-white rounded-xl border ${
                    waste.is_undone
                      ? "border-[#CCCCCC] opacity-60"
                      : "border-[#E5E5E5]"
                  } shadow-sm`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{waste.product_name}</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs text-[#222222]">{waste.quantity}</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs text-[#222222]">{waste.date}</span>
                        {waste.created_by_user_name && (
                          <>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-[#222222]">
                              👤 {waste.created_by_user_name}
                            </span>
                          </>
                        )}
                        {waste.is_undone && (
                          <>
                            <span className="text-xs text-slate-500">•</span>
                            <span className="text-xs text-yellow-400">
                              (Geri Alındı)
                            </span>
                          </>
                        )}
                      </div>
                      {waste.description && (
                        <div className="text-xs text-[#222222]">
                          {waste.description}
                        </div>
                      )}
                      {waste.purchase_id && (
                        <div className="text-xs text-slate-500 mt-1">
                          Alım Kaydı: #{waste.purchase_id}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {waste.log_id && canUndoWaste(waste) && (
                        <button
                          onClick={() => handleUndoWaste(waste.log_id!, waste.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors whitespace-nowrap text-white"
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
      </Modal>
      </>
      )}

      {/* Supplier seçilmediyse boş sayfa göster */}
      {!selectedSupplier && !showSupplierSelector && suppliers.length > 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">Lütfen bir tedarikçi seçin</p>
        </div>
      )}

    </div>
  );
};

