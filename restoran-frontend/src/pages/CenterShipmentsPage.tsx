import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

interface CenterShipment {
  id: number;
  branch_id: number;
  product_id: number;
  product: string;
  date: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  note: string;
}

interface CenterShipmentWithLog extends CenterShipment {
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

interface Product {
  id: number;
  name: string;
  unit: string;
}

export const CenterShipmentsPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [shipments, setShipments] = useState<CenterShipmentWithLog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    product_id: "",
    date: new Date().toISOString().split("T")[0],
    quantity: "",
    unit_price: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = async () => {
    try {
      const res = await apiClient.get("/products", { params: { is_center_product: "true" } });
      setProducts(res.data);
    } catch (err) {
      console.error("Ürünler yüklenemedi:", err);
    }
  };

  const fetchShipments = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const shipmentsRes = await apiClient.get("/center-shipments", { params });
      
      // Audit log'ları çek
      const logParams: any = {
        entity_type: "center_shipment",
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
      
      // Shipments'i log'larla birleştir
      const shipmentsWithLogs: CenterShipmentWithLog[] = shipmentsRes.data.map((shipment: CenterShipment) => {
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "center_shipment" &&
            log.entity_id === shipment.id &&
            log.action === "create"
        );
        
        return {
          ...shipment,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          created_at: createLog?.created_at,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });
      
      setShipments(shipmentsWithLogs);
    } catch (err) {
      console.error("Sevkiyatlar yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchShipments();
  }, [user, selectedBranchId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const unitPriceNum = parseFloat(formData.unit_price);
    
    if (
      !formData.product_id ||
      !formData.quantity ||
      !formData.unit_price ||
      parseFloat(formData.quantity) <= 0 ||
      isNaN(unitPriceNum) || unitPriceNum <= 0
    ) {
      alert("Lütfen tüm alanları doldurun ve geçerli değerler girin");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        product_id: parseInt(formData.product_id),
        date: formData.date,
        quantity: parseFloat(formData.quantity),
        unit_price: unitPriceNum,
        note: formData.note,
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/center-shipments", payload);
      alert("Sevkiyat başarıyla eklendi");
      setFormData({
        product_id: "",
        date: new Date().toISOString().split("T")[0],
        quantity: "",
        unit_price: "",
        note: "",
      });
      setShowForm(false);
      fetchShipments();
    } catch (err: any) {
      alert(err.response?.data?.error || "Sevkiyat eklenemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProduct = products.find(
    (p) => p.id === parseInt(formData.product_id)
  );

  const handleUndo = async (logId: number, _shipmentId: number) => {
    if (!confirm("Bu işlemi geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("İşlem başarıyla geri alındı");
      fetchShipments();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const canUndo = (shipment: CenterShipmentWithLog): boolean => {
    if (!shipment.log_id || shipment.is_undone) {
      return false;
    }
    // Super admin her şeyi geri alabilir
    if (user?.role === "super_admin") {
      return true;
    }
    // Branch admin kendi şubesindeki tüm kayıtları geri alabilir
    if (user?.role === "branch_admin" && user.branch_id) {
      return shipment.branch_id === user.branch_id;
    }
    return false;
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#222222]">
          Sevkiyat kayıtları ve işlem geçmişi
        </p>
        <div className="flex gap-2">
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
        >
            {showForm ? "Formu Gizle" : "Sevkiyat Ekle"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Manuel Sevkiyat Ekle</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-[#555555] mb-1">
                Ürün
              </label>
              <select
                value={formData.product_id}
                onChange={(e) =>
                  setFormData({ ...formData, product_id: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                required
              >
                <option value="">Ürün seçin...</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.unit})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#222222] mb-1">Tarih</label>
              <input
                type="date"
                value={formData.date || new Date().toISOString().split("T")[0]}
                onChange={(e) =>
                  setFormData({ ...formData, date: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#222222] mb-1">
                  Miktar ({selectedProduct?.unit || "birim"})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.quantity}
                  onChange={(e) =>
                    setFormData({ ...formData, quantity: e.target.value })
                  }
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#222222] mb-1">
                  Birim Fiyat (TL)
                </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.unit_price}
                    onChange={(e) =>
                      setFormData({ ...formData, unit_price: e.target.value })
                    }
                    className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                    placeholder="0.00"
                    required
                  />
              </div>
            </div>
            {formData.quantity &&
              formData.unit_price &&
              parseFloat(formData.quantity) > 0 &&
              parseFloat(formData.unit_price) > 0 && (
                <div className="text-xs text-[#222222]">
                  Toplam:{" "}
                  {(
                    parseFloat(formData.quantity) *
                    parseFloat(formData.unit_price)
                  ).toFixed(2)}{" "}
                  TL
                </div>
              )}
            <div>
              <label className="block text-xs text-[#222222] mb-1">
                Not (Opsiyonel)
              </label>
              <input
                type="text"
                value={formData.note}
                onChange={(e) =>
                  setFormData({ ...formData, note: e.target.value })
                }
                className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                placeholder="Not..."
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-sm transition-colors"
              >
                {submitting ? "Ekleniyor..." : "Ekle"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormData({
                    product_id: "",
                    date: new Date().toISOString().split("T")[0],
                    quantity: "",
                    unit_price: "",
                    note: "",
                  });
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
              >
                İptal
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-[#F4F4F4] rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
        <h2 className="text-sm font-semibold mb-3">Sevkiyat Listesi</h2>
        {loading ? (
          <p className="text-xs text-[#222222]">Yükleniyor...</p>
        ) : shipments.length === 0 ? (
          <p className="text-xs text-[#222222]">Henüz sevkiyat kaydı yok</p>
        ) : (
          <div className="space-y-2">
            {shipments.map((shipment) => (
              <div
                key={shipment.id}
                className={`p-3 bg-white rounded-xl border ${
                  shipment.is_undone
                    ? "border-[#CCCCCC] opacity-60"
                    : "border-[#E5E5E5]"
                } shadow-sm`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">
                        {shipment.product}
                      </span>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-[#222222]">
                        {shipment.date}
                      </span>
                      {shipment.created_by_user_name && (
                        <>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-xs text-slate-300">
                            👤 {shipment.created_by_user_name}
                          </span>
                        </>
                      )}
                      {shipment.is_undone && (
                        <>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-xs text-yellow-400">
                            (Geri Alındı)
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-[#222222]">
                      {shipment.quantity} adet • Birim:{" "}
                      {shipment.unit_price.toFixed(2)} TL
                      {shipment.note && ` • ${shipment.note}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-right">
                      {shipment.total_price.toFixed(2)} TL
                    </div>
                    {shipment.log_id && canUndo(shipment) && (
                      <button
                        onClick={() =>
                          handleUndo(shipment.log_id!, shipment.id)
                        }
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors whitespace-nowrap"
                      >
                        Geri Al
                      </button>
                    )}
                    {!shipment.log_id && (
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
