import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiClient } from "../api/client";
import { Modal } from "../components/Modal";

interface Product {
  id: number;
  name: string;
  unit: string;
}

interface StockEntry {
  id: number;
  branch_id: number;
  product_id: number;
  product_name: string;
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
  unit: string;
  quantity: number;
  last_update: string;
}

interface StockUsageRow {
  product_id: number;
  product_name: string;
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
  const [entriesHistoryDateFilter, setEntriesHistoryDateFilter] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
  });
  const [stockItems, setStockItems] = useState<StockEntryItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentStockSearchQuery, setCurrentStockSearchQuery] = useState("");
  const [monthlyReportSearchQuery, setMonthlyReportSearchQuery] = useState("");

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
      setProducts(res.data);
      
      // Eğer stockItems boşsa, tüm ürünleri ekle
      if (stockItems.length === 0 && res.data.length > 0) {
        const items: StockEntryItem[] = res.data.map((product: Product) => ({
          product_id: product.id,
          product_name: product.name,
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
      <div className="flex items-center justify-center py-8">
        <div className="flex gap-4">
          <button
            onClick={() => setShowForm(true)}
            className="px-8 py-4 rounded-xl text-base font-semibold transition-colors bg-[#8F1A9F] hover:bg-[#7a168c] text-white shadow-lg hover:shadow-xl"
          >
            Stok Sayımı
          </button>
          <button
            onClick={() => setShowCurrentStock(true)}
            className="px-8 py-4 rounded-xl text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl"
          >
            Mevcut Stok Durumu
          </button>
          <button
            onClick={() => setShowReport(true)}
            className="px-8 py-4 rounded-xl text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl"
          >
            Aylık Harcama
          </button>
          <button
            onClick={() => {
              fetchStockEntries();
              setShowEntriesHistory(true);
            }}
            className="px-8 py-4 rounded-xl text-base font-semibold transition-colors bg-white text-[#8F1A9F] border border-[#E5E5E5] shadow-lg hover:shadow-xl"
          >
            Geçmiş Girişleri Görüntüle
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
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-2">Ürün</th>
                    <th className="text-right p-2">Miktar</th>
                    <th className="text-right p-2">Son Güncelleme</th>
                  </tr>
                </thead>
                <tbody>
                  {currentStock
                    .filter((stock) =>
                      stock.product_name.toLowerCase().includes(currentStockSearchQuery.toLowerCase())
                    )
                    .map((stock) => (
                      <tr key={stock.product_id} className="border-b border-slate-800">
                        <td className="p-2">
                          <div className="font-medium">{stock.product_name}</div>
                          <div className="text-[#222222] text-xs">{stock.unit}</div>
                        </td>
                        <td className="text-right p-2 font-semibold">
                          {stock.quantity.toFixed(2)}
                        </td>
                        <td className="text-right p-2 text-[#222222]">
                          {stock.last_update || "Henüz giriş yok"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {currentStockSearchQuery && currentStock.filter((stock) =>
                stock.product_name.toLowerCase().includes(currentStockSearchQuery.toLowerCase())
              ).length === 0 && (
                <p className="text-xs text-slate-500 py-4 text-center">
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
              value={formData.date}
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
              <p className="text-xs text-slate-500 py-4 text-center">
                Henüz ürün eklenmemiş. Ürün yönetimi sayfasından ürün ekleyin.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left p-2">Ürün</th>
                      <th className="text-right p-2">Birim</th>
                      <th className="text-right p-2">Mevcut Stok</th>
                      <th className="text-right p-2">Sayım Miktarı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockItems
                      .filter((item) =>
                        item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((item) => {
                        const currentStockItem = currentStock.find(
                          (cs) => cs.product_id === item.product_id
                        );
                        return (
                          <tr key={item.product_id} className="border-b border-slate-800">
                            <td className="p-2">
                              <div className="font-medium">{item.product_name}</div>
                            </td>
                            <td className="text-right p-2 text-[#777777]">
                              {item.unit}
                            </td>
                            <td className="text-right p-2 text-[#222222]">
                              {currentStockItem ? currentStockItem.quantity.toFixed(2) : "0.00"}
                            </td>
                            <td className="p-2">
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
                  <p className="text-xs text-slate-500 py-4 text-center">
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
                  unit: product.unit,
                  quantity: "",
                })));
                localStorage.removeItem(STORAGE_KEY);
              }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm transition-colors text-white"
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
          setEntriesHistoryDateFilter("");
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
            {entriesHistoryDateFilter && (
              <button
                onClick={() => setEntriesHistoryDateFilter("")}
                className="px-3 py-2 bg-slate-500 hover:bg-slate-600 rounded text-sm text-white transition-colors"
              >
                Temizle
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
                              <span className="text-xs text-slate-500">•</span>
                              <span className="text-xs text-slate-300">
                                👤 {group.user_name}
                              </span>
                            </>
                          )}
                          {group.allUndone && (
                            <>
                              <span className="text-xs text-slate-500">•</span>
                              <span className="text-xs text-yellow-400">
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
                        <div className="text-xs text-slate-500">
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
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs transition-colors whitespace-nowrap"
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
                    <div className="border-t border-slate-700 p-3 space-y-2">
                      {group.entries.map((entry) => (
                        <div
                          key={entry.id}
                          className={`p-2 bg-slate-900 rounded border ${
                            entry.is_undone
                              ? "border-slate-600 opacity-60"
                              : "border-slate-800"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium">
                                  {entry.product_name}
                                </span>
                                {entry.is_undone && (
                                  <>
                                    <span className="text-xs text-slate-500">•</span>
                                    <span className="text-xs text-yellow-400">
                                      (Geri Alındı)
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="text-xs text-[#222222]">
                                {(() => {
                                  const currentStockItem = currentStock.find(
                                    (cs) => cs.product_id === entry.product_id
                                  );
                                  const unit = currentStockItem?.unit || "birim";
                                  return `${entry.quantity.toFixed(2)} ${unit}`;
                                })()}
                              </div>
                              {entry.note && (
                                <div className="text-xs text-blue-400 mt-1">
                                  {entry.note}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
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
                      ))}
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
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-2">Ürün</th>
                    <th className="text-right p-2">Başlangıç</th>
                    <th className="text-right p-2">Gelen</th>
                    <th className="text-right p-2">Son</th>
                    <th className="text-right p-2">Harcanan</th>
                  </tr>
                </thead>
                <tbody>
                  {stockUsage
                    .filter((row) =>
                      row.product_name.toLowerCase().includes(monthlyReportSearchQuery.toLowerCase())
                    )
                    .map((row) => (
                      <tr
                        key={row.product_id}
                        className="border-b border-slate-800"
                      >
                        <td className="p-2">
                          <div className="font-medium">{row.product_name}</div>
                          <div className="text-[#222222] text-xs">
                            {row.unit}
                          </div>
                        </td>
                        <td className="text-right p-2">
                          {row.start_qty.toFixed(2)}
                        </td>
                        <td className="text-right p-2">
                          {row.incoming_qty.toFixed(2)}
                        </td>
                        <td className="text-right p-2">
                          {row.end_qty.toFixed(2)}
                        </td>
                        <td className="text-right p-2 text-red-400 font-semibold">
                          {row.used_qty.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {monthlyReportSearchQuery && stockUsage.filter((row) =>
                row.product_name.toLowerCase().includes(monthlyReportSearchQuery.toLowerCase())
              ).length === 0 && (
                <p className="text-xs text-slate-500 py-4 text-center">
                  "{monthlyReportSearchQuery}" için sonuç bulunamadı
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
