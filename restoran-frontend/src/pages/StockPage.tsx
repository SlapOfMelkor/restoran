import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";
import { Modal } from "../components/Modal";
import { ProductImage } from "../components/ProductImage";

interface Product {
  id: number;
  name: string;
  unit: string;
  stock_code?: string;
}

interface StockEntry {
  id: number;
  branch_id: number;
  product_id: number;
  product_name: string;
  stock_code?: string;
  date: string;
  quantity: number;
  note?: string;
  created_at: string;
}

interface StockEntryWithLog extends StockEntry {
  created_by_user_id?: number;
  created_by_user_name?: string;
  log_id?: number;
  is_undone?: boolean;
}

interface StockCountGroup {
  id: string; // date + created_at timestamp (rounded to minute)
  date: string;
  created_at: string;
  user_name?: string;
  entries: StockEntryWithLog[];
  allUndone: boolean;
}

interface CurrentStock {
  product_id: number;
  product_name: string;
  stock_code?: string;
  unit: string;
  quantity: number;
  last_update: string;
  order_index?: number; // XLSX'ten gelen sıralama
}

interface StockUsageRow {
  product_id: number;
  product_name: string;
  stock_code?: string;
  unit: string;
  start_qty: number;
  incoming_qty: number;
  end_qty: number;
  used_qty: number;
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

interface StockEntryItem {
  product_id: number;
  product_name: string;
  stock_code?: string;
  unit: string;
  quantity: string; // string olarak tutuyoruz input için
}

const STORAGE_KEY = "stock_entry_draft";

export const StockPage: React.FC = () => {
  const { user, selectedBranchId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [currentStock, setCurrentStock] = useState<CurrentStock[]>([]);
  const [stockEntries, setStockEntries] = useState<StockEntryWithLog[]>([]);
  const [stockUsage, setStockUsage] = useState<StockUsageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showEntriesHistory, setShowEntriesHistory] = useState(false);
  const [showCurrentStock, setShowCurrentStock] = useState(false);
  const [entriesHistoryDateFilter, setEntriesHistoryDateFilter] = useState<string>(new Date().toISOString().split("T")[0]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
  });
  const [stockItems, setStockItems] = useState<StockEntryItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentStockSearchQuery, setCurrentStockSearchQuery] = useState("");
  const [monthlyReportSearchQuery, setMonthlyReportSearchQuery] = useState("");
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderProductIds, setOrderProductIds] = useState<number[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [selectingIndex, setSelectingIndex] = useState<number | null>(null);
  const [productSelectorQuery, setProductSelectorQuery] = useState("");

  // localStorage'dan draft'ı yükle
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setFormData(draft.formData || { date: new Date().toISOString().split("T")[0] });
        setStockItems(draft.items || []);
      } catch (e) {
        console.error("Draft yüklenemedi:", e);
      }
    }
  }, []);

  // localStorage'a kaydet
  useEffect(() => {
    if (stockItems.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        formData,
        items: stockItems,
      }));
    }
  }, [formData, stockItems]);

  const fetchProducts = async () => {
    try {
      const res = await apiClient.get("/products", { params: { is_center_product: "true" } });
      const fetchedProducts: Product[] = res.data;
      setProducts(fetchedProducts);
      
      // Mevcut ürün ID'lerini bir set'te topla (hızlı kontrol için)
      const existingProductIDs = new Set(fetchedProducts.map((p: Product) => p.id));
      
      // stockItems içindeki silinmiş ürünleri filtrele
      if (stockItems.length > 0) {
        const validStockItems = stockItems.filter(item => existingProductIDs.has(item.product_id));
        if (validStockItems.length !== stockItems.length) {
          setStockItems(validStockItems);
        }
      }
      
      // Eğer stockItems boşsa, tüm ürünleri ekle
      if (stockItems.length === 0 && fetchedProducts.length > 0) {
        const items: StockEntryItem[] = fetchedProducts.map((product: Product) => ({
          product_id: product.id,
          product_name: product.name,
          stock_code: product.stock_code,
          unit: product.unit,
          quantity: "",
        }));
        setStockItems(items);
      }
    } catch (err) {
      console.error("Ürünler yüklenemedi:", err);
    }
  };

  const fetchCurrentStock = async () => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/stock-entries/current", { params });
      setCurrentStock(res.data);
    } catch (err) {
      console.error("Mevcut stok yüklenemedi:", err);
    }
  };

  const fetchStockEntries = async () => {
    try {
      const params: any = {};
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const entriesRes = await apiClient.get("/stock-entries", { params });

      // Audit log'ları çek
      const logParams: any = {
        entity_type: "stock_entry",
      };
      if (user?.role === "super_admin") {
        if (selectedBranchId) {
          logParams.branch_id = selectedBranchId;
        }
      } else if (user?.role === "branch_admin" && user.branch_id) {
        logParams.branch_id = user.branch_id;
      }
      const logsRes = await apiClient.get("/audit-logs", { params: logParams });

      // Entries'i log'larla birleştir
      const entriesWithLogs: StockEntryWithLog[] = entriesRes.data.map((entry: StockEntry) => {
        const createLog = logsRes.data.find(
          (log: AuditLog) =>
            log.entity_type === "stock_entry" &&
            log.entity_id === entry.id &&
            log.action === "create"
        );

        return {
          ...entry,
          created_by_user_id: createLog?.user_id,
          created_by_user_name: createLog?.user_name,
          log_id: createLog?.id,
          is_undone: createLog?.is_undone || false,
        };
      });

      setStockEntries(entriesWithLogs);
    } catch (err) {
      console.error("Stok girişleri yüklenemedi:", err);
    }
  };

  const fetchStockUsage = async () => {
    setLoading(true);
    try {
      const params: any = {
        year: reportData.year,
        month: reportData.month,
      };
      if (user?.role === "super_admin" && selectedBranchId) {
        params.branch_id = selectedBranchId;
      }
      const res = await apiClient.get("/stock-usage/monthly", { params });
      setStockUsage(res.data.rows || []);
    } catch (err) {
      console.error("Stok harcama raporu yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };


  const [reportData, setReportData] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  useEffect(() => {
    fetchProducts();
    fetchCurrentStock();
    fetchStockEntries();
    if (showReport) {
      fetchStockUsage();
    }
  }, [user, selectedBranchId, showReport, reportData]);

  const updateItem = (productId: number, quantity: string) => {
    const newItems = stockItems.map((item) =>
      item.product_id === productId ? { ...item, quantity } : item
    );
    setStockItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Sadece miktar girilen ürünleri filtrele
    const itemsToSave = stockItems.filter(
      (item) => item.quantity && parseFloat(item.quantity) >= 0
    );

    if (itemsToSave.length === 0) {
      alert("En az bir ürün için miktar girmelisiniz");
      return;
    }

    setSubmitting(true);
    try {
      // Her ürün için ayrı stok girişi oluştur
      const promises = itemsToSave.map((item) => {
        // Mevcut stok bilgisini bul
        const currentStockItem = currentStock.find(
          (cs) => cs.product_id === item.product_id
        );
        const currentQuantity = currentStockItem ? currentStockItem.quantity : 0;

        const payload: any = {
          product_id: item.product_id,
          date: formData.date,
          quantity: parseFloat(item.quantity),
          current_quantity: currentQuantity, // Mevcut stok bilgisini gönder
        };

        if (user?.role === "super_admin" && selectedBranchId) {
          payload.branch_id = selectedBranchId;
        }

        return apiClient.post("/stock-entries", payload);
      });

      await Promise.all(promises);
      alert("Stok sayımı başarıyla kaydedildi");

      // Formu temizle
      setFormData({
        date: new Date().toISOString().split("T")[0],
      });
      // Ürünleri sıfırla ama listeyi koru
      setStockItems(products.map((product) => ({
        product_id: product.id,
        product_name: product.name,
        unit: product.unit,
        quantity: "",
      })));
      localStorage.removeItem(STORAGE_KEY);
      setShowForm(false);
      setSearchQuery("");
      fetchCurrentStock();
      fetchStockEntries();
    } catch (err: any) {
      alert(err.response?.data?.error || "Stok sayımı kaydedilemedi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async (logId: number, _entryId: number) => {
    if (!confirm("Bu işlemi geri almak istediğinize emin misiniz?")) {
      return;
    }

    try {
      await apiClient.post(`/audit-logs/${logId}/undo`);
      alert("İşlem başarıyla geri alındı");
      fetchCurrentStock();
      fetchStockEntries();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  // Stok girişlerini grupla (aynı tarih ve yakın created_at = aynı sayım)
  const groupStockEntries = (entries: StockEntryWithLog[]): StockCountGroup[] => {
    const groups = new Map<string, StockEntryWithLog[]>();

    entries.forEach((entry) => {
      // Tarih ve created_at'i dakika bazında grupla
      const entryDate = new Date(entry.created_at);
      const groupKey = `${entry.date}_${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}-${String(entryDate.getDate()).padStart(2, '0')}_${String(entryDate.getHours()).padStart(2, '0')}-${String(entryDate.getMinutes()).padStart(2, '0')}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(entry);
    });

    // Grupları StockCountGroup formatına çevir
    const result: StockCountGroup[] = [];
    groups.forEach((groupEntries, groupKey) => {
      // Tarih ve created_at'i al (ilk entry'den)
      const firstEntry = groupEntries[0];
      
      // Tüm entry'ler geri alınmış mı kontrol et
      const allUndone = groupEntries.every((e) => e.is_undone);

      result.push({
        id: groupKey,
        date: firstEntry.date,
        created_at: firstEntry.created_at,
        user_name: firstEntry.created_by_user_name,
        entries: groupEntries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        allUndone,
      });
    });

    // Tarihe göre sırala (en yeni önce)
    return result.sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateB.getTime() - dateA.getTime();
    });
  };

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const handleUndoGroup = async (group: StockCountGroup) => {
    if (!confirm(`Bu sayımdaki tüm ürünleri (${group.entries.length} adet) geri almak istediğinize emin misiniz?`)) {
      return;
    }

    try {
      // Tüm entry'ler için geri alma işlemi yap
      const undoPromises = group.entries
        .filter((entry) => entry.log_id && !entry.is_undone && canUndo(entry))
        .map((entry) => apiClient.post(`/audit-logs/${entry.log_id}/undo`));

      await Promise.all(undoPromises);
      alert("Sayımdaki tüm ürünler başarıyla geri alındı");
      fetchCurrentStock();
      fetchStockEntries();
    } catch (err: any) {
      alert(err.response?.data?.error || "Geri alma işlemi başarısız");
    }
  };

  const canUndo = (entry: StockEntryWithLog): boolean => {
    if (!entry.log_id || entry.is_undone) {
      return false;
    }
    if (user?.role === "super_admin") {
      return true;
    }
    // Branch admin kendi şubesindeki tüm kayıtları geri alabilir
    if (user?.role === "branch_admin" && user.branch_id) {
      return entry.branch_id === user.branch_id;
    }
    return false;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center py-4 md:py-8">
        <div className="flex flex-col md:flex-row gap-3 md:gap-4 w-full max-w-md md:max-w-none px-4 md:px-0 md:flex-wrap md:justify-center">
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Stok Sayımı
          </button>
          <button
            onClick={() => setShowCurrentStock(true)}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Mevcut Stok Durumu
          </button>
          <button
            onClick={() => setShowReport(true)}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Aylık Harcama
          </button>
          <button
            onClick={() => {
              fetchStockEntries();
              setEntriesHistoryDateFilter(new Date().toISOString().split("T")[0]);
              setShowEntriesHistory(true);
            }}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Geçmiş Girişleri Görüntüle
          </button>
          <button
            onClick={async () => {
              // Mevcut sıralamayı yükle
              try {
                const params: any = {};
                if (user?.role === "super_admin" && selectedBranchId) {
                  params.branch_id = selectedBranchId;
                }
                const res = await apiClient.get("/stock-entries/order", { params });
                setOrderProductIds(res.data.product_ids || []);
                setShowOrderModal(true);
              } catch (err) {
                console.error("Sıralama yüklenemedi:", err);
                setOrderProductIds([]);
                setShowOrderModal(true);
              }
            }}
            className="px-6 py-3 md:px-8 md:py-4 rounded-xl text-sm md:text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl w-full md:min-w-[200px] md:max-w-[250px] whitespace-normal text-center break-words"
          >
            Stok Sırasını Değiştir
          </button>
        </div>
      </div>

      {/* Mevcut Stok Durumu Modal */}
      <Modal
        isOpen={showCurrentStock}
        onClose={() => {
          setShowCurrentStock(false);
          setCurrentStockSearchQuery("");
        }}
        title="Mevcut Stok Durumu"
        maxWidth="xl"
      >
        <div className="space-y-4">
          {/* Filtreleme */}
          <div>
            <input
              type="text"
              value={currentStockSearchQuery}
              onChange={(e) => setCurrentStockSearchQuery(e.target.value)}
              placeholder="Ürün ara..."
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
            />
          </div>

          {/* Tablo */}
          {currentStock.length === 0 ? (
            <p className="text-xs text-[#222222] text-center py-8">
              Henüz stok girişi yok
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E5E5E5]">
                    <th className="text-left p-3">Ürün</th>
                    <th className="text-right p-3">Miktar</th>
                    <th className="text-right p-3 hidden sm:table-cell">Son Güncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {currentStock
                    .filter((stock) =>
                      stock.product_name.toLowerCase().includes(currentStockSearchQuery.toLowerCase())
                    )
                    .map((stock) => {
                      const product = products.find(p => p.id === stock.product_id);
                      return (
                        <tr key={stock.product_id} className="border-b border-[#E5E5E5]">
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <ProductImage
                                stockCode={stock.stock_code || product?.stock_code}
                                productName={stock.product_name}
                                size="md"
                              />
                              <div>
                                <div className="font-medium">{stock.product_name}</div>
                                <div className="text-[#222222] text-xs">{stock.unit}</div>
                              </div>
                            </div>
                          </td>
                          <td className="text-right p-3 font-semibold">
                            {stock.quantity.toFixed(2)}
                          </td>
                          <td className="text-right p-3 text-[#222222] hidden sm:table-cell">
                            {stock.last_update || "Henüz giriş yok"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {currentStockSearchQuery && currentStock.filter((stock) =>
                stock.product_name.toLowerCase().includes(currentStockSearchQuery.toLowerCase())
              ).length === 0 && (
                <p className="text-xs text-[#555555] py-4 text-center">
                  "{currentStockSearchQuery}" için sonuç bulunamadı
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Stok Sayımı Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setSearchQuery("");
        }}
        title="Yeni Stok Sayımı Ekle"
        maxWidth="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-[#555555] mb-1">Sayım Tarihi</label>
            <input
              type="date"
              value={formData.date || new Date().toISOString().split("T")[0]}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
              required
            />
          </div>


          {/* Filtreleme */}
          <div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ürün ara..."
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
            />
          </div>

          {/* Ürün Tablosu */}
          <div>
            {stockItems.length === 0 ? (
                <p className="text-xs text-[#555555] py-4 text-center">
                Henüz ürün eklenmemiş. Ürün yönetimi sayfasından ürün ekleyin.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E5E5]">
                      <th className="text-left p-3">Ürün</th>
                      <th className="text-right p-3 hidden sm:table-cell">Birim</th>
                      <th className="text-right p-3 hidden md:table-cell">Mevcut Stok</th>
                      <th className="text-right p-3">Sayım Miktarı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockItems
                      .filter((item) =>
                        searchQuery === "" ||
                        item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .sort((a, b) => {
                        // Filtreleme varsa sıralama yok (özgün sıra korunur)
                        if (searchQuery) {
                          return 0;
                        }
                        // Filtreleme yoksa, currentStock'tan order_index'e göre sırala
                        const aStock = currentStock.find(cs => cs.product_id === a.product_id);
                        const bStock = currentStock.find(cs => cs.product_id === b.product_id);
                        const aOrder = aStock?.order_index;
                        const bOrder = bStock?.order_index;
                        
                        // order_index olanlar önce, sonra diğerleri
                        if (aOrder !== undefined && bOrder !== undefined) {
                          return aOrder - bOrder;
                        }
                        if (aOrder !== undefined) return -1;
                        if (bOrder !== undefined) return 1;
                        // İkisi de yoksa ürün adına göre alfabetik
                        return a.product_name.localeCompare(b.product_name);
                      })
                      .map((item) => {
                        const currentStockItem = currentStock.find(
                          (cs) => cs.product_id === item.product_id
                        );
                        return (
                          <tr key={item.product_id} className="border-b border-[#E5E5E5]">
                            <td className="p-3">
                              <div className="flex items-center gap-3">
                                <ProductImage
                                  stockCode={item.stock_code}
                                  productName={item.product_name}
                                  size="md"
                                />
                                <div>
                                  <div className="font-medium">{item.product_name}</div>
                                  <div className="text-[#777777] text-xs sm:hidden">{item.unit}</div>
                                </div>
                              </div>
                            </td>
                            <td className="text-right p-3 text-[#777777] hidden sm:table-cell">
                              {item.unit}
                            </td>
                            <td className="text-right p-3 text-[#222222] hidden md:table-cell">
                              {currentStockItem ? currentStockItem.quantity.toFixed(2) : "0.00"}
                            </td>
                            <td className="p-3">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.quantity}
                                onChange={(e) => updateItem(item.product_id, e.target.value)}
                                className="w-full bg-white border border-[#E5E5E5] rounded px-2 py-1 text-sm text-[#000000] text-right focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
                                placeholder="0.00"
                              />
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {searchQuery && stockItems.filter((item) =>
                  item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
                ).length === 0 && (
                  <p className="text-xs text-[#555555] py-4 text-center">
                    "{searchQuery}" için sonuç bulunamadı
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || stockItems.length === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded text-sm transition-colors text-white"
            >
              {submitting ? "Kaydediliyor..." : "Stok Sayımını Kaydet"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormData({
                  date: new Date().toISOString().split("T")[0],
                });
                setStockItems(products.map((product) => ({
                  product_id: product.id,
                  product_name: product.name,
                  stock_code: product.stock_code,
                  unit: product.unit,
                  quantity: "",
                })));
                localStorage.removeItem(STORAGE_KEY);
              }}
              className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#222222]"
            >
              Temizle
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setSearchQuery("");
              }}
              className="px-4 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm transition-colors text-[#8F1A9F]"
            >
              İptal
            </button>
          </div>
        </form>
      </Modal>

      {/* Geçmiş Stok Girişleri Modal */}
      <Modal
        isOpen={showEntriesHistory}
        onClose={() => {
          setShowEntriesHistory(false);
          setEntriesHistoryDateFilter(new Date().toISOString().split("T")[0]);
        }}
        title="Geçmiş Stok Girişleri"
        maxWidth="xl"
      >
        <div className="space-y-4">
          {/* Tarih Filtresi */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={entriesHistoryDateFilter}
              onChange={(e) => setEntriesHistoryDateFilter(e.target.value)}
              className="bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
            />
            {entriesHistoryDateFilter !== new Date().toISOString().split("T")[0] && (
              <button
                onClick={() => setEntriesHistoryDateFilter(new Date().toISOString().split("T")[0])}
                className="px-3 py-2 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-sm text-[#222222] transition-colors"
              >
                Bugüne Dön
              </button>
            )}
          </div>

          {/* Stok Girişleri Listesi */}
          {stockEntries.length === 0 ? (
            <p className="text-xs text-[#222222] text-center py-8">Henüz stok girişi yok</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {(entriesHistoryDateFilter
                ? groupStockEntries(stockEntries.filter(entry => entry.date === entriesHistoryDateFilter))
                : groupStockEntries(stockEntries)
              ).map((group) => (
                <div
                  key={group.id}
                  className={`bg-white rounded-xl border ${
                    group.allUndone
                      ? "border-[#CCCCCC] opacity-60"
                      : "border-[#E5E5E5]"
                  } shadow-sm`}
                >
                  {/* Grup Başlığı */}
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold">
                            Stok Sayımı - {group.date}
                          </span>
                          {group.user_name && (
                            <>
                              <span className="text-xs text-[#777777]">•</span>
                              <span className="text-xs text-[#555555]">
                                👤 {group.user_name}
                              </span>
                            </>
                          )}
                          {group.allUndone && (
                            <>
                              <span className="text-xs text-[#777777]">•</span>
                              <span className="text-xs text-yellow-600">
                                (Tümü Geri Alındı)
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-xs text-[#222222]">
                          {group.entries.length} ürün kaydedildi
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-[#555555]">
                          {new Date(group.created_at).toLocaleString("tr-TR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                        <button
                          onClick={() => toggleGroup(group.id)}
                          className="px-3 py-1.5 bg-[#E5E5E5] hover:bg-[#d5d5d5] rounded text-xs transition-colors whitespace-nowrap text-[#222222]"
                        >
                          {expandedGroups.has(group.id) ? "Gizle" : "Görüntüle"}
                        </button>
                        {!group.allUndone && group.entries.some((e) => canUndo(e)) && (
                          <button
                            onClick={() => handleUndoGroup(group)}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors whitespace-nowrap"
                          >
                            Toplu Geri Al
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Grup Detayları (Expand edildiğinde) */}
                  {expandedGroups.has(group.id) && (
                    <div className="border-t border-[#E5E5E5] p-3 space-y-2 bg-[#F9F9F9]">
                      {group.entries.map((entry) => {
                        const product = products.find(p => p.id === entry.product_id);
                        const currentStockItem = currentStock.find(
                          (cs) => cs.product_id === entry.product_id
                        );
                        const unit = currentStockItem?.unit || "birim";
                        return (
                          <div
                            key={entry.id}
                            className={`p-3 bg-white rounded border ${
                              entry.is_undone
                                ? "border-[#CCCCCC] opacity-60"
                                : "border-[#E5E5E5]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <ProductImage
                                  stockCode={entry.stock_code || product?.stock_code}
                                  productName={entry.product_name}
                                  size="md"
                                  className="flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <span className="text-sm font-medium">
                                      {entry.product_name}
                                    </span>
                                    {entry.is_undone && (
                                      <>
                                        <span className="text-xs text-[#777777]">•</span>
                                        <span className="text-xs text-yellow-600">
                                          (Geri Alındı)
                                        </span>
                                      </>
                                    )}
                                  </div>
                                  <div className="text-xs text-[#222222]">
                                    {entry.quantity.toFixed(2)} {unit}
                                  </div>
                                  {entry.note && (
                                    <div className="text-xs text-blue-400 mt-1">
                                      {entry.note}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {entry.log_id && canUndo(entry) && (
                                  <button
                                    onClick={() => handleUndo(entry.log_id!, entry.id)}
                                    className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors whitespace-nowrap"
                                  >
                                    Geri Al
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Aylık Harcama Raporu Modal */}
      <Modal
        isOpen={showReport}
        onClose={() => {
          setShowReport(false);
          setMonthlyReportSearchQuery("");
        }}
        title="Aylık Harcama Raporu"
        maxWidth="xl"
      >
        <div className="space-y-4">
          {/* Tarih Seçimi */}
          <div className="flex gap-2">
            <input
              type="number"
              value={reportData.year}
              onChange={(e) =>
                setReportData({
                  ...reportData,
                  year: parseInt(e.target.value) || new Date().getFullYear(),
                })
              }
              className="w-20 bg-white border border-[#E5E5E5] rounded px-2 py-1 text-xs text-[#000000]"
              placeholder="Yıl"
            />
            <select
              value={reportData.month}
              onChange={(e) =>
                setReportData({
                  ...reportData,
                  month: parseInt(e.target.value) || 1,
                })
              }
              className="bg-white border border-[#E5E5E5] rounded px-2 py-1 text-xs text-[#000000]"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Filtreleme */}
          <div>
            <input
              type="text"
              value={monthlyReportSearchQuery}
              onChange={(e) => setMonthlyReportSearchQuery(e.target.value)}
              placeholder="Ürün ara..."
              className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
            />
          </div>

          {/* Tablo */}
          {loading ? (
            <p className="text-xs text-[#222222]">Yükleniyor...</p>
          ) : stockUsage.length === 0 ? (
            <p className="text-xs text-[#222222]">Bu ay için harcama raporu yok</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E5E5E5]">
                    <th className="text-left p-3">Ürün</th>
                    <th className="text-right p-3 hidden md:table-cell">Başlangıç</th>
                    <th className="text-right p-3 hidden md:table-cell">Gelen</th>
                    <th className="text-right p-3 hidden lg:table-cell">Son</th>
                    <th className="text-right p-3">Harcanan</th>
                  </tr>
                </thead>
                <tbody>
                  {stockUsage
                    .filter((row) =>
                      row.product_name.toLowerCase().includes(monthlyReportSearchQuery.toLowerCase())
                    )
                    .map((row) => {
                      const product = products.find(p => p.id === row.product_id);
                      return (
                        <tr
                          key={row.product_id}
                          className="border-b border-[#E5E5E5]"
                        >
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              <ProductImage
                                stockCode={row.stock_code || product?.stock_code}
                                productName={row.product_name}
                                size="md"
                              />
                              <div>
                                <div className="font-medium">{row.product_name}</div>
                                <div className="text-[#222222] text-xs">
                                  {row.unit}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="text-right p-3 hidden md:table-cell">
                            {row.start_qty.toFixed(2)}
                          </td>
                          <td className="text-right p-3 hidden md:table-cell">
                            {row.incoming_qty.toFixed(2)}
                          </td>
                          <td className="text-right p-3 hidden lg:table-cell">
                            {row.end_qty.toFixed(2)}
                          </td>
                          <td className="text-right p-3 text-red-400 font-semibold">
                            {row.used_qty.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {monthlyReportSearchQuery && stockUsage.filter((row) =>
                row.product_name.toLowerCase().includes(monthlyReportSearchQuery.toLowerCase())
              ).length === 0 && (
                <p className="text-xs text-[#555555] py-4 text-center">
                  "{monthlyReportSearchQuery}" için sonuç bulunamadı
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Sıralama Düzenleme Modal */}
      <Modal
        isOpen={showOrderModal}
        onClose={() => {
          setShowOrderModal(false);
          setDraggedIndex(null);
          setDraggedOverIndex(null);
        }}
        title="Stok Sırasını Düzenle"
        maxWidth="xl"
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div></div>
            <button
              onClick={async () => {
                if (confirm("Sıralamayı temizlemek istediğinize emin misiniz?")) {
                  try {
                    const params: any = {};
                    if (user?.role === "super_admin" && selectedBranchId) {
                      params.branch_id = selectedBranchId;
                    }
                    await apiClient.delete("/stock-entries/order", { params });
                    setOrderProductIds([]);
                    alert("Sıralama temizlendi");
                  } catch (err: any) {
                    alert(err.response?.data?.error || "Sıralama temizlenemedi");
                  }
                }
              }}
              className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg"
            >
              Sıralamayı Temizle
            </button>
          </div>

          {/* Sıralama Listesi */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {orderProductIds.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                Henüz ürün eklenmemiş. Aşağıdaki boş kutucuğa tıklayarak ürün ekleyin.
              </p>
            )}
            {orderProductIds.map((productId, index) => {
              const product = products.find((p) => p.id === productId);
              if (!product) return null;

              return (
                <div
                  key={`${productId}-${index}`}
                  draggable
                  onDragStart={() => setDraggedIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedIndex !== null && draggedIndex !== index) {
                      setDraggedOverIndex(index);
                    }
                  }}
                  onDragLeave={() => setDraggedOverIndex(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedIndex !== null && draggedIndex !== index) {
                      const newOrder = [...orderProductIds];
                      const [removed] = newOrder.splice(draggedIndex, 1);
                      newOrder.splice(index, 0, removed);
                      setOrderProductIds(newOrder);
                    }
                    setDraggedIndex(null);
                    setDraggedOverIndex(null);
                  }}
                  onClick={() => {
                    setSelectingIndex(index);
                    setProductSelectorQuery("");
                    setShowProductSelector(true);
                  }}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    draggedOverIndex === index
                      ? "border-[#8F1A9F] bg-purple-50"
                      : draggedIndex === index
                      ? "opacity-50 border-gray-300"
                      : "border-gray-200 hover:border-[#8F1A9F] hover:bg-gray-50"
                  }`}
                >
                  <div className="cursor-move text-gray-400 hover:text-gray-600 select-none">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M7 2v2h2V2H7zm4 0v2h2V2h-2zM7 6v2h2V6H7zm4 0v2h2V6h-2zM7 10v2h2v-2H7zm4 0v2h2v-2h-2zM7 14v2h2v-2H7zm4 0v2h2v-2h-2z" />
                    </svg>
                  </div>
                  <ProductImage
                    stockCode={product.stock_code}
                    productName={product.name}
                    size="sm"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{product.name}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const newOrder = orderProductIds.filter((id) => id !== productId);
                      setOrderProductIds(newOrder);
                    }}
                    className="text-red-500 hover:text-red-700 px-2"
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            {/* Boş Satır Ekleme */}
            <div
              onClick={() => {
                setSelectingIndex(orderProductIds.length);
                setProductSelectorQuery("");
                setShowProductSelector(true);
              }}
              className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#8F1A9F] hover:bg-gray-50 text-gray-500 hover:text-[#8F1A9F]"
            >
              + Ürün Ekle
            </div>
          </div>

          {/* Kaydet Butonu */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={() => {
                setShowOrderModal(false);
                setDraggedIndex(null);
                setDraggedOverIndex(null);
              }}
              className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg"
            >
              İptal
            </button>
            <button
              onClick={async () => {
                try {
                  const params: any = {};
                  if (user?.role === "super_admin" && selectedBranchId) {
                    params.branch_id = selectedBranchId;
                  }
                  await apiClient.post(
                    "/stock-entries/order",
                    { product_ids: orderProductIds },
                    { params }
                  );
                  alert("Sıralama başarıyla kaydedildi");
                  setShowOrderModal(false);
                  await fetchCurrentStock();
                } catch (err: any) {
                  alert(err.response?.data?.error || "Sıralama kaydedilemedi");
                }
              }}
              className="px-4 py-2 text-sm bg-[#8F1A9F] hover:bg-[#7a168c] text-white rounded-lg"
            >
              Sırayı Kaydet
            </button>
          </div>
        </div>
      </Modal>

      {/* Ürün Seçici Modal */}
      <Modal
        isOpen={showProductSelector}
        onClose={() => {
          setShowProductSelector(false);
          setSelectingIndex(null);
          setProductSelectorQuery("");
        }}
        title="Ürün Seç"
        maxWidth="md"
      >
        <div className="space-y-4">
          {/* Arama */}
          <input
            type="text"
            value={productSelectorQuery}
            onChange={(e) => setProductSelectorQuery(e.target.value)}
            placeholder="Ürün ara..."
            className="w-full bg-white border border-[#E5E5E5] rounded px-3 py-2 text-sm text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#8F1A9F]"
            autoFocus
          />

          {/* Ürün Listesi */}
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {products
              .filter((p) =>
                productSelectorQuery === "" ||
                p.name.toLowerCase().includes(productSelectorQuery.toLowerCase())
              )
              .filter((p) => {
                // Eğer bir sırayı değiştiriyorsak, o sıradaki ürünü de göster
                if (selectingIndex !== null && selectingIndex < orderProductIds.length) {
                  return p.id === orderProductIds[selectingIndex] || !orderProductIds.includes(p.id);
                }
                // Yeni ürün ekliyorsak, sadece eklenmemiş ürünleri göster
                return !orderProductIds.includes(p.id);
              })
              .map((product) => (
                <div
                  key={product.id}
                  onClick={() => {
                    if (selectingIndex !== null) {
                      const newOrder = [...orderProductIds];
                      if (selectingIndex < newOrder.length) {
                        // Mevcut bir sırayı değiştir
                        newOrder[selectingIndex] = product.id;
                      } else {
                        // Yeni ürün ekle
                        newOrder.push(product.id);
                      }
                      setOrderProductIds(newOrder);
                    }
                    setShowProductSelector(false);
                    setSelectingIndex(null);
                    setProductSelectorQuery("");
                  }}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-[#8F1A9F] hover:bg-gray-50"
                >
                  <ProductImage
                    stockCode={product.stock_code}
                    productName={product.name}
                    size="sm"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{product.name}</div>
                    {product.stock_code && (
                      <div className="text-xs text-gray-500">{product.stock_code}</div>
                    )}
                  </div>
                </div>
              ))}
            {products
              .filter((p) =>
                productSelectorQuery === "" ||
                p.name.toLowerCase().includes(productSelectorQuery.toLowerCase())
              )
              .filter((p) => {
                if (selectingIndex !== null && selectingIndex < orderProductIds.length) {
                  return p.id === orderProductIds[selectingIndex] || !orderProductIds.includes(p.id);
                }
                return !orderProductIds.includes(p.id);
              }).length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4">
                Ürün bulunamadı
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
