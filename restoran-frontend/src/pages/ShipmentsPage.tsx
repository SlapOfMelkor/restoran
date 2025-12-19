import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";

interface Product {
  id: number;
  name: string;
  unit: string;
}

interface ShipmentItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Shipment {
  id: number;
  branch_id: number;
  date: string;
  total_amount: number;
  is_stocked: boolean;
  note: string;
  items: ShipmentItem[];
  created_at: string;
}

interface ShipmentWithLog extends Shipment {
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

const STORAGE_KEY = "shipment_draft";

export const ShipmentsPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [shipments, setShipments] = useState<ShipmentWithLog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    note: "",
  });
  const [shipmentItems, setShipmentItems] = useState<ShipmentItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // localStorage'dan draft'ı yükle (ürünler yüklendikten sonra)
  useEffect(() => {
    if (products.length === 0) return; // Ürünler henüz yüklenmedi
    
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setFormData(draft.formData || { date: new Date().toISOString().split("T")[0], note: "" });
        
        // Draft'taki items'ları kontrol et ve geçersiz product_id'leri temizle
        const draftItems = draft.items || [];
        const validItems = draftItems.filter((item: ShipmentItem) => {
          const productExists = products.find(p => p.id === item.product_id);
          if (!productExists) {
            console.warn("Draft'ta geçersiz product_id bulundu:", item.product_id);
            return false;
          }
          return true;
        });
        
        // Geçerli product_id'leri güncelle
        const updatedItems = validItems.map((item: ShipmentItem) => {
          const product = products.find(p => p.id === item.product_id);
          if (product) {
            return {
              ...item,
              product_name: product.name, // product_name'i güncelle
            };
          }
          return item;
        });
        
        setShipmentItems(updatedItems);
      } catch (e) {
        console.error("Draft yüklenemedi:", e);
      }
    }
  }, [products]);

  // localStorage'a kaydet
  useEffect(() => {
    if (shipmentItems.length > 0 || formData.note) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        formData,
        items: shipmentItems,
      }));
    }
  }, [formData, shipmentItems]);

  const fetchProducts = async () => {
    try {
      const res = await apiClient.get("/products");
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
      const shipmentsRes = await apiClient.get("/shipments", { params });

      // Audit log'ları çek
      const logParams: any = {
        entity_type: "shipment",
      };
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          logParams.branch_id = selectedBranchId;
        }
      } else if (user?.role === "branch_admin" && user.branch_id) {
        logParams.branch_id = user.branch_id;
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });

      // Shipments'i log'larla birleştir
      const shipmentsWithLogs: ShipmentWithLog[] = shipmentsRes.data.map((shipment: Shipment) => {
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "shipment" &&
            log.entity_id === shipment.id &&
            log.action === "create"
        );

        return {
          ...shipment,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
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

  const addProductToTable = () => {
    if (products.length === 0) return;
    const firstProduct = products[0];
    setShipmentItems([
      ...shipmentItems,
      {
        product_id: firstProduct.id,
        product_name: firstProduct.name,
        quantity: 0,
        unit_price: 0,
        total_price: 0,
      },
    ]);
  };

  const updateItem = (index: number, field: keyof ShipmentItem, value: number | string) => {
    const newItems = [...shipmentItems];
    const item = newItems[index];
    
    if (field === "product_id") {
      const productId = Number(value);
      if (productId === 0 || isNaN(productId)) {
        console.error("Geçersiz product_id:", value);
        return;
      }
      const product = products.find((p) => p.id === productId);
      if (product) {
        item.product_id = product.id;
        item.product_name = product.name;
      } else {
        console.error("Ürün bulunamadı:", productId, "Mevcut ürünler:", products.map(p => p.id));
        alert(`Ürün bulunamadı (ID: ${productId}). Lütfen sayfayı yenileyin.`);
        return;
      }
    } else if (field === "quantity" || field === "unit_price") {
      item[field] = Number(value);
      item.total_price = item.quantity * item.unit_price;
    }

    newItems[index] = item;
    setShipmentItems(newItems);
  };

  const removeItem = (index: number) => {
    setShipmentItems(shipmentItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (shipmentItems.length === 0) {
      alert("En az bir ürün eklenmelidir");
      return;
    }

    // Ürün ID kontrolü
    const invalidProductIds = shipmentItems.filter(
      (item) => !item.product_id || item.product_id === 0 || !products.find(p => p.id === item.product_id)
    );
    if (invalidProductIds.length > 0) {
      alert("Geçersiz ürün seçimi. Lütfen tüm ürünleri tekrar seçin.");
      return;
    }

    const invalidItems = shipmentItems.filter(
      (item) => item.quantity <= 0 || item.unit_price <= 0
    );
    if (invalidItems.length > 0) {
      alert("Tüm ürünler için miktar ve birim fiyat 0'dan büyük olmalıdır");
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        date: formData.date,
        items: shipmentItems.map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
        note: formData.note,
      };

      if (user?.role === "super_admin" && selectedBranchId) {
        payload.branch_id = selectedBranchId;
      }

      await apiClient.post("/shipments", payload);
      alert("Sevkiyat başarıyla kaydedildi");

      // Formu temizle
      setFormData({
        date: new Date().toISOString().split("T")[0],
        note: "",
      });
      setShipmentItems([]);
      localStorage.removeItem(STORAGE_KEY);
      setShowForm(false);
      fetchShipments();
    } catch (err: any) {
      alert(err.response?.data?.error || "Sevkiyat kaydedilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStockShipment = async (shipmentId: number) => {
    if (!confirm("Bu sevkiyatı stoka kaydetmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/shipments/${shipmentId}/stock`);
      alert("Sevkiyat başarıyla stoka kaydedildi");
      fetchShipments();
    } catch (err: any) {
      alert(err.response?.data?.error || "Stoka kaydetme başarısız");
    }
  };

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

  const canUndo = (shipment: ShipmentWithLog): boolean => {
    if (!shipment.log_id || shipment.is_undone) {
      return false;
    }
    if (user?.role === "super_admin") {
      return true;
    }
    return shipment.created_by_user_id === user?.id;
  };

  const totalAmount = shipmentItems.reduce((sum, item) => sum + item.total_price, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#222222]">
          Ürün sevkiyatlarını yönetin ve stoka aktarın
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-lg text-sm transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white"
        >
          {showForm ? "Formu Gizle" : "Yeni Sevkiyat"}
        </button>
      </div>

      {showForm && (
        <div className="bg-white/80 rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Yeni Sevkiyat Ekle</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#222222] mb-1">Tarih</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-[#222222] mb-1">Not</label>
                <input
                  type="text"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                  placeholder="Opsiyonel not"
                />
              </div>
            </div>

            {/* Ürün Tablosu */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-[#222222]">Ürünler</label>
                <button
                  type="button"
                  onClick={addProductToTable}
                  className="px-3 py-1 bg-[#8F1A9F] hover:bg-[#7a168c] rounded text-xs transition-colors text-white"
                >
                  + Ürün Ekle
                </button>
              </div>

              {shipmentItems.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  Henüz ürün eklenmedi. "+ Ürün Ekle" butonuna tıklayın.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left p-2">Ürün</th>
                        <th className="text-right p-2">Miktar</th>
                        <th className="text-right p-2">Birim Fiyat</th>
                        <th className="text-right p-2">Toplam</th>
                        <th className="text-center p-2">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipmentItems.map((item, index) => (
                        <tr key={index} className="border-b border-slate-800">
                          <td className="p-2">
                            <select
                              value={item.product_id || ""}
                              onChange={(e) => updateItem(index, "product_id", e.target.value)}
                              className="w-full bg-white border border-[#E5E5E5] rounded px-2 py-1 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                            >
                              <option value="">Ürün Seçin</option>
                              {products.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.name} ({product.unit})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.quantity || ""}
                              onChange={(e) => updateItem(index, "quantity", e.target.value)}
                              className="w-full bg-white border border-[#E5E5E5] rounded px-2 py-1 text-sm text-[#000000] text-right focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.unit_price || ""}
                              onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                              className="w-full bg-white border border-[#E5E5E5] rounded px-2 py-1 text-sm text-[#000000] text-right focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="p-2 text-right font-semibold">
                            {item.total_price.toFixed(2)} TL
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
                            >
                              Sil
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-700">
                        <td colSpan={3} className="p-2 text-right font-semibold">
                          Toplam:
                        </td>
                        <td className="p-2 text-right font-bold text-emerald-400">
                          {totalAmount.toFixed(2)} TL
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || shipmentItems.length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-sm transition-colors"
              >
                {submitting ? "Kaydediliyor..." : "Sevkiyatı Kaydet"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormData({
                    date: new Date().toISOString().split("T")[0],
                    note: "",
                  });
                  setShipmentItems([]);
                  localStorage.removeItem(STORAGE_KEY);
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors"
              >
                Temizle
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white/80 rounded-2xl border border-[#E5E5E5] p-4 shadow-sm">
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
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">
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
                      {shipment.is_stocked && (
                        <>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-xs text-green-400">✓ Stoka Kaydedildi</span>
                        </>
                      )}
                      {shipment.is_undone && (
                        <>
                          <span className="text-xs text-slate-500">•</span>
                          <span className="text-xs text-yellow-400">(Geri Alındı)</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-[#222222]">
                      {shipment.items.length} ürün • Toplam: {shipment.total_amount.toFixed(2)} TL
                      {shipment.note && ` • ${shipment.note}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!shipment.is_stocked && !shipment.is_undone && (
                      <button
                        onClick={() => handleStockShipment(shipment.id)}
                        className="px-3 py-1.5 bg-[#8F1A9F] hover:bg-[#7a168c] rounded text-xs transition-colors whitespace-nowrap text-white"
                      >
                        Stoka Kaydet
                      </button>
                    )}
                    {shipment.log_id && canUndo(shipment) && (
                      <button
                        onClick={() => handleUndo(shipment.log_id!, shipment.id)}
                        className="px-3 py-1.5 bg-[#D32F2F] hover:bg-[#B71C1C] rounded text-xs transition-colors whitespace-nowrap text-white"
                      >
                        Geri Al
                      </button>
                    )}
                  </div>
                </div>
                {/* Ürün detayları */}
                <div className="mt-2 pt-2 border-t border-slate-700">
                  <div className="text-xs text-[#222222] space-y-1">
                    {shipment.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{item.product_name}</span>
                        <span>
                          {item.quantity} x {item.unit_price.toFixed(2)} = {item.total_price.toFixed(2)} TL
                        </span>
                      </div>
                    ))}
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

